using TaskTracker.Core.Completion;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Settings;
using TaskTracker.Core.Undo;
using TaskTracker.Core.Urgency;

namespace TaskTracker.Core.Items;

/// <summary>Coordinates item edits, structure, completion, and area snapshots.</summary>
public sealed class ItemService(
    IUnitOfWorkFactory unitOfWorkFactory,
    TimeProvider clock,
    TimeZoneInfo timeZone,
    FieldWriteGate? writeGate = null)
{
    private readonly FieldWriteGate gate = writeGate ?? FieldWriteGate.Shared;

    public async Task<TodoItem> CreateAsync(Guid projectId, Guid? folderId, Guid? parentId, string title, CancellationToken cancellationToken = default)
    {
        if (!TodoItem.IsTitleValid(title))
        {
            throw new DomainRuleException("Item title is required and must be at most 300 characters.");
        }

        await using var unitOfWork = unitOfWorkFactory.Begin();
        var items = unitOfWork.Items;
        var tree = await LoadTreeAsync(unitOfWork, projectId, folderId, cancellationToken);
        var item = TodoItem.Create(projectId, folderId, parentId, title, clock, tree.Children(parentId).Count);
        tree.Add(item);
        items.Add(item);
        Renumber(tree, parentId);
        await ApplyStructureAsync(unitOfWork, tree, parentId, UndoLabels.Create(item.Title), cancellationToken);
        return item;
    }

    public async Task EditAsync(Guid id, ItemEdit edit, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var item = await unitOfWork.Items.FindAsync(id, cancellationToken)
            ?? throw new DomainRuleException("Item is missing or deleted.");
        ValidateEdit(edit);
        ApplyEdit(item, edit);
        await unitOfWork.SaveChangesAsync(UndoLabels.Edit(item.Title), cancellationToken);
    }

    /// <summary>Finds the current project and folder of an active item, or null when it is gone.</summary>
    public async Task<ItemLocation?> FindLocationAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await using var work = unitOfWorkFactory.Begin();
        var item = await work.Items.FindAsync(id, cancellationToken);

        if (item is null)
        {
            return null;
        }

        return new ItemLocation(item.ProjectId, item.FolderId);
    }

    /// <summary>Loads the custom values for one active item.</summary>
    public async Task<IReadOnlyList<ItemFieldValue>> LoadFieldValuesAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await using var work = unitOfWorkFactory.Begin();
        _ = await work.Items.FindAsync(id, cancellationToken)
            ?? throw new DomainRuleException("Item is missing or deleted.");
        return await work.Fields.ValuesAsync(id, cancellationToken);
    }

    /// <summary>Loads the links of one active item in display order.</summary>
    public async Task<IReadOnlyList<ItemLink>> LoadLinksAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await using var work = unitOfWorkFactory.Begin();
        _ = await work.Items.FindAsync(id, cancellationToken)
            ?? throw new DomainRuleException("Item is missing or deleted.");
        return await work.Items.LinksAsync(id, cancellationToken);
    }

    /// <summary>
    /// Edits built-in fields and only the listed custom fields in one save; blank values remove their rows.
    /// A non-null <paramref name="links"/> replaces the item's whole link list in the same save (one undo step);
    /// null leaves the links alone.
    /// </summary>
    public async Task EditAsync(Guid id, ItemEdit edit, IReadOnlyList<FieldValueInput> values,
        IReadOnlyList<ItemLinkInput>? links = null, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        values = values.Select(Normalize).ToArray();
        await using var work = unitOfWorkFactory.Begin();
        var item = await work.Items.FindAsync(id, cancellationToken)
            ?? throw new DomainRuleException("Item is missing or deleted.");
        ValidateEdit(edit);
        await ApplyValueChangesAsync(work, item, values, cancellationToken);

        if (links is not null)
        {
            await ItemLinkEditor.ApplyAsync(work.Items, id, links, clock, cancellationToken);
        }

        ApplyEdit(item, edit);
        await work.SaveChangesAsync(UndoLabels.Edit(item.Title), cancellationToken);
    }

    private static async Task ApplyValueChangesAsync(IUnitOfWork work, TodoItem item,
        IReadOnlyList<FieldValueInput> inputs, CancellationToken cancellationToken)
    {
        ValidateDistinctFields(inputs);
        var definitions = await work.Fields.DefinitionsAsync(cancellationToken);
        var existing = await work.Fields.ValuesAsync(item.Id, cancellationToken);

        foreach (var input in inputs)
        {
            await ValidateValueAsync(work, item, definitions, existing, input, cancellationToken);
        }

        foreach (var input in inputs)
        {
            var old = existing.SingleOrDefault(value => value.FieldDefinitionId == input.FieldDefinitionId);
            ApplyValueChange(work.Fields, item.Id, old, input);
        }
    }

    private static void ValidateDistinctFields(IReadOnlyList<FieldValueInput> inputs)
    {
        if (inputs.Select(input => input.FieldDefinitionId).Distinct().Count() != inputs.Count)
        {
            throw new DomainRuleException("Each field may appear only once.");
        }
    }

    private static void ApplyValueChange(IFieldRepository repository, Guid itemId,
        ItemFieldValue? old, FieldValueInput input)
    {
        if (!HasValue(input))
        {
            if (old is not null)
            {
                repository.Remove(old);
            }

            return;
        }

        if (old is null)
        {
            repository.Add(ItemFieldValue.Create(itemId, input));
            return;
        }

        old.Replace(input);
    }

    private static async Task ValidateValueAsync(IUnitOfWork work, TodoItem item,
        IReadOnlyList<FieldDefinition> definitions, IReadOnlyList<ItemFieldValue> existing,
        FieldValueInput input, CancellationToken cancellationToken)
    {
        var field = definitions.SingleOrDefault(row => row.Id == input.FieldDefinitionId)
            ?? throw new DomainRuleException("Field was not found.");

        if (field.ProjectId is not null && field.ProjectId != item.ProjectId)
        {
            throw new DomainRuleException("Field does not belong to the item's project.");
        }

        if (!HasValue(input))
        {
            return;
        }

        if (IsUnchanged(existing, input))
        {
            return;
        }

        var choice = await FindChoiceAsync(work.Fields, field.Id, input.ChoiceId, cancellationToken);
        FieldValueValidator.Validate(item.ProjectId, field, input, choice);
    }

    private static bool IsUnchanged(IReadOnlyList<ItemFieldValue> existing, FieldValueInput input)
    {
        var old = existing.SingleOrDefault(row => row.FieldDefinitionId == input.FieldDefinitionId);
        return SameValue(old, input);
    }

    private static async Task<FieldChoice?> FindChoiceAsync(IFieldRepository repository, Guid fieldId,
        Guid? choiceId, CancellationToken cancellationToken)
    {
        if (choiceId is null)
        {
            return null;
        }

        var choices = await repository.ChoicesAsync(fieldId, cancellationToken);
        return choices.SingleOrDefault(choice => choice.Id == choiceId);
    }

    private static bool HasValue(FieldValueInput input)
    {
        return !string.IsNullOrWhiteSpace(input.TextValue) || input.NumberValue is not null ||
            input.DateValue is not null || input.BoolValue is not null || input.ChoiceId is not null;
    }

    private static FieldValueInput Normalize(FieldValueInput input)
    {
        return input with
        {
            TextValue = string.IsNullOrWhiteSpace(input.TextValue) ? null : input.TextValue.Trim()
        };
    }

    private static bool SameValue(ItemFieldValue? old, FieldValueInput input)
    {
        return old is not null && old.TextValue == input.TextValue?.Trim() &&
            old.NumberValue == input.NumberValue && old.DateValue == input.DateValue &&
            old.BoolValue == input.BoolValue && old.ChoiceId == input.ChoiceId;
    }

    private static void ValidateEdit(ItemEdit edit)
    {
        if (!TodoItem.IsTitleValid(edit.Title))
        {
            throw new DomainRuleException("Item title is required and must be at most 300 characters.");
        }

        if (!TodoItem.IsTicketNumberValid(edit.TicketNumber) || (edit.DueDate is null && edit.DueTime is not null))
        {
            throw new DomainRuleException("Item edit has invalid ticket or due fields.");
        }

        if (edit.ScheduledEnd is not null &&
            (edit.ScheduledStart is null || edit.ScheduledEnd < edit.ScheduledStart))
        {
            throw new DomainRuleException("Scheduled end requires an earlier start.");
        }

        if (edit.ScheduledStart?.Kind == DateTimeKind.Utc || edit.ScheduledEnd?.Kind == DateTimeKind.Utc)
        {
            throw new DomainRuleException("Scheduled times must be floating local values.");
        }
    }

    private void ApplyEdit(TodoItem item, ItemEdit edit)
    {
        item.Rename(edit.Title, clock);
        item.SetDescription(edit.Description, clock);
        item.SetTicketNumber(edit.TicketNumber, clock);
        item.SetLookups(edit.ItemTypeId, edit.PriorityLevelId, clock);
        item.SetDue(edit.DueDate, edit.DueTime, clock);
        item.SetSchedule(edit.ScheduledStart, edit.ScheduledEnd, clock);
    }

    public async Task<CompletionResult> SetCompletedAsync(Guid projectId, Guid? folderId, Guid id,
        bool completed, bool confirmed = false, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var tree = await LoadTreeAsync(unitOfWork, projectId, folderId, cancellationToken);
        var effective = await GetSettingsAsync(unitOfWork, projectId, cancellationToken);
        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var result = completed
            ? CompletionService.Complete(tree, id, effective.AutoCompleteParents.Value, nowUtc, confirmed)
            : CompletionService.Reopen(tree, id, effective.AutoCompleteParents.Value, nowUtc);

        if (result is CompletionResult.Applied applied)
        {
            ApplyChanges(tree, applied);
            await unitOfWork.SaveChangesAsync(CompletionLabel(tree.Get(id).Title, completed), cancellationToken);
        }

        return result;
    }

    private static string CompletionLabel(string title, bool completed)
    {
        if (completed)
        {
            return UndoLabels.Complete(title);
        }

        return UndoLabels.Reopen(title);
    }

    public async Task<Guid> DeleteAsync(Guid projectId, Guid? folderId, Guid id, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var tree = await LoadTreeAsync(unitOfWork, projectId, folderId, cancellationToken);
        var parentId = tree.Get(id).ParentItemId;
        var batchId = Guid.CreateVersion7();
        var label = UndoLabels.Delete(tree.Get(id).Title);
        tree.DeleteSubtree(id, batchId, clock);
        Renumber(tree, parentId);
        await ApplyStructureAsync(unitOfWork, tree, parentId, label, cancellationToken);
        return batchId;
    }

    public async Task RestoreAsync(Guid projectId, Guid? folderId, Guid batchId, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var tree = await LoadTreeAsync(unitOfWork, projectId, folderId, cancellationToken);
        var branch = tree.AllRows.Where(item => item.DeletionBatchId == batchId).ToArray();
        var branchIds = branch.Select(item => item.Id).ToHashSet();

        if (branch.Length == 0)
        {
            throw new DomainRuleException("Item deletion batch was not found.");
        }

        foreach (var item in branch)
        {
            if (item.ParentItemId is Guid parentId && !branchIds.Contains(parentId))
            {
                tree.Get(parentId);
            }

            item.Restore(clock);
        }

        foreach (var parentId in branch.Select(item => item.ParentItemId).Distinct())
        {
            Renumber(tree, parentId);
            await ReconcileAsync(unitOfWork, tree, parentId, projectId, cancellationToken);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task MoveAsync(Guid projectId, Guid? folderId, Guid id, Guid? newParentId, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var tree = await LoadTreeAsync(unitOfWork, projectId, folderId, cancellationToken);
        var label = UndoLabels.Move(tree.Get(id).Title);
        await MoveWithinTreeAsync(unitOfWork, tree, id, newParentId, label, cancellationToken);
    }

    private async Task MoveWithinTreeAsync(IUnitOfWork work, ItemTree tree, Guid id,
        Guid? newParentId, string undoLabel, CancellationToken cancellationToken)
    {
        var oldParentId = tree.Get(id).ParentItemId;
        tree.Move(id, newParentId, clock);
        tree.Get(id).SetSortOrder(tree.Children(newParentId).Count - 1, clock);
        Renumber(tree, oldParentId);
        Renumber(tree, newParentId);
        await ReconcileAsync(work, tree, oldParentId, tree.ProjectId, cancellationToken);
        await ApplyStructureAsync(work, tree, newParentId, undoLabel, cancellationToken);
    }

    public async Task IndentAsync(Guid projectId, Guid? folderId, Guid id, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var tree = await LoadTreeAsync(unitOfWork, projectId, folderId, cancellationToken);
        var item = tree.Get(id);
        var siblings = tree.Children(item.ParentItemId);
        var index = Array.FindIndex(siblings.ToArray(), sibling => sibling.Id == id);

        if (index == 0)
        {
            throw new DomainRuleException("The first sibling cannot be indented.");
        }

        var label = UndoLabels.Indent(item.Title);
        await MoveWithinTreeAsync(unitOfWork, tree, id, siblings[index - 1].Id, label, cancellationToken);
    }

    public async Task OutdentAsync(Guid projectId, Guid? folderId, Guid id, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var tree = await LoadTreeAsync(unitOfWork, projectId, folderId, cancellationToken);
        var parentId = tree.Get(id).ParentItemId
            ?? throw new DomainRuleException("A top-level item cannot be outdented.");
        var grandparentId = tree.Get(parentId).ParentItemId;
        var parentIndex = tree.Children(grandparentId).ToList().FindIndex(item => item.Id == parentId);
        var label = UndoLabels.Outdent(tree.Get(id).Title);
        await MoveAtAsync(unitOfWork, tree, id, grandparentId, parentIndex + 1, label, cancellationToken);
    }

    /// <summary>Places an item at an index among siblings in the same area.</summary>
    public async Task MoveAtAsync(Guid projectId, Guid? folderId, Guid id, Guid? parentId,
        int index, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var tree = await LoadTreeAsync(unitOfWork, projectId, folderId, cancellationToken);
        await MoveAtAsync(unitOfWork, tree, id, parentId, index, UndoLabels.Move(tree.Get(id).Title), cancellationToken);
    }

    private async Task MoveAtAsync(IUnitOfWork work, ItemTree tree, Guid id, Guid? parentId,
        int index, string undoLabel, CancellationToken cancellationToken)
    {
        var oldParentId = tree.Get(id).ParentItemId;
        var destination = tree.Children(parentId).Where(item => item.Id != id).ToList();

        if (index < 0 || index > destination.Count)
        {
            throw new DomainRuleException("Item position is outside its siblings.");
        }

        tree.Move(id, parentId, clock);
        destination.Insert(index, tree.Get(id));
        Renumber(tree, oldParentId);

        for (var position = 0; position < destination.Count; position++)
        {
            destination[position].SetSortOrder(position, clock);
        }

        await ReconcileAsync(work, tree, oldParentId, tree.ProjectId, cancellationToken);
        await ApplyStructureAsync(work, tree, parentId, undoLabel, cancellationToken);
    }

    public async Task MoveToAreaAsync(Guid projectId, Guid? sourceFolderId, Guid? targetFolderId,
        Guid id, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var source = await LoadTreeAsync(unitOfWork, projectId, sourceFolderId, cancellationToken);
        var destination = await LoadTreeAsync(unitOfWork, projectId, targetFolderId, cancellationToken);
        source.MoveTopLevelTo(id, destination, clock);
        destination.Get(id).SetSortOrder(destination.Children(null).Count - 1, clock);
        Renumber(source, null);
        Renumber(destination, null);
        await ReconcileAsync(unitOfWork, source, null, projectId, cancellationToken);
        await ReconcileAsync(unitOfWork, destination, null, projectId, cancellationToken);
        await unitOfWork.SaveChangesAsync(UndoLabels.Move(destination.Get(id).Title), cancellationToken);
    }

    public async Task ReorderAsync(Guid projectId, Guid? folderId, Guid? parentId,
        IReadOnlyList<Guid> ids, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var tree = await LoadTreeAsync(unitOfWork, projectId, folderId, cancellationToken);
        var siblings = tree.Children(parentId);

        if (ids.Count != siblings.Count || ids.ToHashSet().Count != siblings.Count || siblings.Any(item => !ids.Contains(item.Id)))
        {
            throw new DomainRuleException("Order must contain every sibling exactly once.");
        }

        for (var index = 0; index < ids.Count; index++)
        {
            tree.Get(ids[index]).SetSortOrder(index, clock);
        }

        await ReconcileAsync(unitOfWork, tree, parentId, projectId, cancellationToken);
        await unitOfWork.SaveChangesAsync(UndoLabels.ReorderItems(), cancellationToken);
    }

    public async Task<AreaSnapshot> LoadAreaAsync(Guid projectId, Guid? folderId, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var lookups = unitOfWork.Lookups;
        var tree = await LoadTreeAsync(unitOfWork, projectId, folderId, cancellationToken);
        var effective = await GetSettingsAsync(unitOfWork, projectId, cancellationToken);
        var thresholds = new UrgencyThresholds(effective.UrgencyYellowThreshold.Value, effective.UrgencyRedThreshold.Value);
        var roots = tree.Children(null).Select(item => BuildNode(tree, item, thresholds)).ToArray();
        return new AreaSnapshot(projectId, folderId, roots,
            await lookups.ItemTypesAsync(cancellationToken),
            await lookups.PriorityLevelsAsync(cancellationToken), effective);
    }

    private void Renumber(ItemTree tree, Guid? parentId)
    {
        var siblings = tree.Children(parentId);

        for (var index = 0; index < siblings.Count; index++)
        {
            siblings[index].SetSortOrder(index, clock);
        }
    }

    private ItemNode BuildNode(ItemTree tree, TodoItem item, UrgencyThresholds thresholds)
    {
        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var children = tree.Children(item.Id).Select(child => BuildNode(tree, child, thresholds)).ToArray();
        var own = UrgencyCalculator.Calculate(item, nowUtc, timeZone, thresholds);
        var displayed = UrgencyCalculator.CalculateDisplayed(tree, item.Id, nowUtc, timeZone, thresholds);
        return new ItemNode(item, own, displayed, CompletionService.IsFinished(tree, item.Id), children);
    }

    private async Task<ItemTree> LoadTreeAsync(IUnitOfWork unitOfWork, Guid projectId, Guid? folderId, CancellationToken cancellationToken)
    {
        var projects = unitOfWork.Projects;
        var folders = unitOfWork.Folders;
        var items = unitOfWork.Items;
        if (await projects.FindAsync(projectId, false, cancellationToken) is null)
        {
            throw new DomainRuleException("Project is missing or deleted.");
        }

        var folderTree = new FolderTree(projectId, await folders.ListAsync(projectId, true, cancellationToken));
        var rows = await items.LoadAreaAsync(projectId, folderId, cancellationToken);
        return new ItemTree(projectId, folderId, rows, folderTree);
    }

    private async Task<EffectiveSettings> GetSettingsAsync(IUnitOfWork unitOfWork, Guid projectId, CancellationToken cancellationToken)
    {
        var settings = unitOfWork.Settings;
        var global = await settings.GetGlobalAsync(cancellationToken);
        var project = await settings.GetProjectAsync(projectId, cancellationToken);
        return SettingsResolver.Resolve(global, project);
    }

    private async Task ApplyStructureAsync(IUnitOfWork unitOfWork, ItemTree tree, Guid? parentId,
        string undoLabel, CancellationToken cancellationToken)
    {
        await ReconcileAsync(unitOfWork, tree, parentId, tree.ProjectId, cancellationToken);
        await unitOfWork.SaveChangesAsync(undoLabel, cancellationToken);
    }

    private async Task ReconcileAsync(IUnitOfWork unitOfWork, ItemTree tree, Guid? parentId, Guid projectId, CancellationToken cancellationToken)
    {
        var effective = await GetSettingsAsync(unitOfWork, projectId, cancellationToken);
        var changes = CompletionService.AfterStructureChanged(tree, parentId,
            effective.AutoCompleteParents.Value, clock.GetUtcNow().UtcDateTime);
        ApplyChanges(tree, changes);
    }

    private void ApplyChanges(ItemTree tree, CompletionResult.Applied result)
    {
        foreach (var change in result.Changes)
        {
            tree.Get(change.ItemId).SetCompletion(change.CompletedAtUtc, clock);
        }
    }
}