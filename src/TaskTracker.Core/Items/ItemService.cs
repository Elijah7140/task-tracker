using TaskTracker.Core.Completion;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Settings;
using TaskTracker.Core.Urgency;

namespace TaskTracker.Core.Items;

/// <summary>Coordinates item edits, structure, completion, and area snapshots.</summary>
public sealed class ItemService(
    IUnitOfWorkFactory unitOfWorkFactory,
    TimeProvider clock,
    TimeZoneInfo timeZone)
{
    public async Task<TodoItem> CreateAsync(Guid projectId, Guid? folderId, Guid? parentId, string title, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(title) || title.Length > 300)
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
        await ApplyStructureAsync(unitOfWork, tree, parentId, cancellationToken);
        return item;
    }

    public async Task EditAsync(Guid id, ItemEdit edit, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var item = await unitOfWork.Items.FindAsync(id, cancellationToken)
            ?? throw new DomainRuleException("Item is missing or deleted.");
        ValidateEdit(edit);
        ApplyEdit(item, edit);
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private static void ValidateEdit(ItemEdit edit)
    {
        if (string.IsNullOrWhiteSpace(edit.Title) || edit.Title.Trim().Length > 300)
        {
            throw new DomainRuleException("Item title is required and must be at most 300 characters.");
        }

        if (edit.TicketNumber?.Length > 100 || (edit.DueDate is null && edit.DueTime is not null))
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
            await unitOfWork.SaveChangesAsync(cancellationToken);
        }

        return result;
    }

    public async Task<Guid> DeleteAsync(Guid projectId, Guid? folderId, Guid id, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var tree = await LoadTreeAsync(unitOfWork, projectId, folderId, cancellationToken);
        var parentId = tree.Get(id).ParentItemId;
        var batchId = Guid.CreateVersion7();
        tree.DeleteSubtree(id, batchId, clock);
        Renumber(tree, parentId);
        await ApplyStructureAsync(unitOfWork, tree, parentId, cancellationToken);
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
        await MoveWithinTreeAsync(unitOfWork, tree, id, newParentId, cancellationToken);
    }

    private async Task MoveWithinTreeAsync(IUnitOfWork work, ItemTree tree, Guid id,
        Guid? newParentId, CancellationToken cancellationToken)
    {
        var oldParentId = tree.Get(id).ParentItemId;
        tree.Move(id, newParentId, clock);
        tree.Get(id).SetSortOrder(tree.Children(newParentId).Count - 1, clock);
        Renumber(tree, oldParentId);
        Renumber(tree, newParentId);
        await ReconcileAsync(work, tree, oldParentId, tree.ProjectId, cancellationToken);
        await ApplyStructureAsync(work, tree, newParentId, cancellationToken);
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

        await MoveWithinTreeAsync(unitOfWork, tree, id, siblings[index - 1].Id, cancellationToken);
    }

    public async Task OutdentAsync(Guid projectId, Guid? folderId, Guid id, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var tree = await LoadTreeAsync(unitOfWork, projectId, folderId, cancellationToken);
        var parentId = tree.Get(id).ParentItemId
            ?? throw new DomainRuleException("A top-level item cannot be outdented.");
        var grandparentId = tree.Get(parentId).ParentItemId;
        await MoveWithinTreeAsync(unitOfWork, tree, id, grandparentId, cancellationToken);
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
        await unitOfWork.SaveChangesAsync(cancellationToken);
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
        await unitOfWork.SaveChangesAsync(cancellationToken);
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

    private async Task ApplyStructureAsync(IUnitOfWork unitOfWork, ItemTree tree, Guid? parentId, CancellationToken cancellationToken)
    {
        await ReconcileAsync(unitOfWork, tree, parentId, tree.ProjectId, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
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