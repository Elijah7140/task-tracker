using TaskTracker.Core.Persistence;
using TaskTracker.Core.Search;
using TaskTracker.Core.Undo;

namespace TaskTracker.Core.Fields;

/// <summary>Manages global and project custom fields and their choices.</summary>
public sealed class FieldService(IUnitOfWorkFactory unitOfWorkFactory, FieldWriteGate? writeGate = null)
{
    private readonly FieldWriteGate gate = writeGate ?? FieldWriteGate.Shared;

    public async Task<IReadOnlyList<FieldDefinition>> ListEffectiveAsync(Guid projectId, CancellationToken cancellationToken = default)
    {
        await using var work = unitOfWorkFactory.Begin();
        var fields = await work.Fields.DefinitionsAsync(cancellationToken);
        return fields.Where(field => !field.IsArchived && field.ProjectId is null)
            .OrderBy(field => field.SortOrder)
            .Concat(fields.Where(field => !field.IsArchived && field.ProjectId == projectId)
                .OrderBy(field => field.SortOrder)).ToArray();
    }

    public async Task<IReadOnlyList<FieldDefinition>> ListAllAsync(Guid? projectId, CancellationToken cancellationToken = default)
    {
        await using var work = unitOfWorkFactory.Begin();
        var fields = await work.Fields.DefinitionsAsync(cancellationToken);
        return fields.Where(field => field.ProjectId is null || field.ProjectId == projectId).ToArray();
    }

    public async Task<FieldDefinition> CreateAsync(string name, FieldDataType type, Guid? projectId,
        CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var work = unitOfWorkFactory.Begin();
        await EnsureProjectAsync(work, projectId, cancellationToken);
        var fields = await work.Fields.DefinitionsAsync(cancellationToken);
        var order = fields.Count(field => field.ProjectId == projectId);
        var usedKeys = fields.Select(row => row.Key).Concat(BuiltInSearchKeys.Reserved);
        var field = FieldDefinition.Create(name, type, projectId, order, usedKeys);
        EnsureUniqueName(fields, field);
        work.Fields.Add(field);
        await work.SaveChangesAsync(UndoLabels.AddField(field.DisplayName), cancellationToken);
        return field;
    }

    public async Task RenameAsync(Guid id, string name, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var work = unitOfWorkFactory.Begin();
        var fields = await work.Fields.DefinitionsAsync(cancellationToken);
        var field = Find(fields, id);
        field.Rename(name);
        EnsureUniqueName(fields, field);
        await work.SaveChangesAsync(UndoLabels.RenameField(field.DisplayName), cancellationToken);
    }

    public async Task ChangeTypeAsync(Guid id, FieldDataType type, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var work = unitOfWorkFactory.Begin();
        var fields = await work.Fields.DefinitionsAsync(cancellationToken);
        var field = Find(fields, id);
        field.ChangeType(type, await work.Fields.HasValuesAsync(id, cancellationToken));
        await work.SaveChangesAsync(UndoLabels.ChangeFieldType(field.DisplayName), cancellationToken);
    }

    public async Task ArchiveAsync(Guid id, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var work = unitOfWorkFactory.Begin();
        var fields = await work.Fields.DefinitionsAsync(cancellationToken);
        var field = Find(fields, id);
        field.Archive();
        await work.SaveChangesAsync(UndoLabels.ArchiveField(field.DisplayName), cancellationToken);
    }

    public async Task UnarchiveAsync(Guid id, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var work = unitOfWorkFactory.Begin();
        var fields = await work.Fields.DefinitionsAsync(cancellationToken);
        var field = Find(fields, id);
        field.Unarchive();
        EnsureUniqueName(fields, field);
        await work.SaveChangesAsync(UndoLabels.RestoreField(field.DisplayName), cancellationToken);
    }

    /// <summary>Orders every definition in the given scope, including archived rows; a project scope accepts only its own definitions.</summary>
    public async Task ReorderAsync(Guid? projectId, IReadOnlyList<Guid> ids, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var work = unitOfWorkFactory.Begin();
        var fields = (await work.Fields.DefinitionsAsync(cancellationToken))
            .Where(field => field.ProjectId == projectId).ToArray();
        ValidateOrder(fields.Select(field => field.Id), ids);

        for (var index = 0; index < ids.Count; index++)
        {
            fields.Single(field => field.Id == ids[index]).Reorder(index);
        }

        await work.SaveChangesAsync(UndoLabels.ReorderFields(), cancellationToken);
    }

    public async Task<IReadOnlyList<FieldChoice>> ListChoicesAsync(Guid fieldId, CancellationToken cancellationToken = default)
    {
        await using var work = unitOfWorkFactory.Begin();
        return await work.Fields.ChoicesAsync(fieldId, cancellationToken);
    }

    public async Task<FieldChoice> AddChoiceAsync(Guid fieldId, string label, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var work = unitOfWorkFactory.Begin();
        var fields = await work.Fields.DefinitionsAsync(cancellationToken);
        var field = Find(fields, fieldId);
        EnsureChoiceField(field);
        var choices = await work.Fields.ChoicesAsync(fieldId, cancellationToken);
        var choice = FieldChoice.Create(fieldId, label, choices.Count);
        EnsureUniqueChoice(choices, choice);
        work.Fields.Add(choice);
        await work.SaveChangesAsync(UndoLabels.AddChoice(choice.Label), cancellationToken);
        return choice;
    }

    public async Task RenameChoiceAsync(Guid fieldId, Guid choiceId, string label, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var work = unitOfWorkFactory.Begin();
        var choices = await work.Fields.ChoicesAsync(fieldId, cancellationToken);
        var choice = FindChoice(choices, choiceId);
        choice.Rename(label);
        EnsureUniqueChoice(choices, choice);
        await work.SaveChangesAsync(UndoLabels.RenameChoice(choice.Label), cancellationToken);
    }

    public async Task ArchiveChoiceAsync(Guid fieldId, Guid choiceId, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var work = unitOfWorkFactory.Begin();
        var choices = await work.Fields.ChoicesAsync(fieldId, cancellationToken);
        var choice = FindChoice(choices, choiceId);
        choice.Archive();
        await work.SaveChangesAsync(UndoLabels.ArchiveChoice(choice.Label), cancellationToken);
    }

    public async Task UnarchiveChoiceAsync(Guid fieldId, Guid choiceId, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var work = unitOfWorkFactory.Begin();
        var choices = await work.Fields.ChoicesAsync(fieldId, cancellationToken);
        var choice = FindChoice(choices, choiceId);
        choice.Unarchive();
        EnsureUniqueChoice(choices, choice);
        await work.SaveChangesAsync(UndoLabels.RestoreChoice(choice.Label), cancellationToken);
    }

    /// <summary>Orders every choice of this field, including archived choices.</summary>
    public async Task ReorderChoicesAsync(Guid fieldId, IReadOnlyList<Guid> ids, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var work = unitOfWorkFactory.Begin();
        var choices = await work.Fields.ChoicesAsync(fieldId, cancellationToken);
        ValidateOrder(choices.Select(choice => choice.Id), ids);

        for (var index = 0; index < ids.Count; index++)
        {
            choices.Single(choice => choice.Id == ids[index]).Reorder(index);
        }

        await work.SaveChangesAsync(UndoLabels.ReorderChoices(), cancellationToken);
    }

    private static FieldDefinition Find(IEnumerable<FieldDefinition> fields, Guid id)
    {
        return fields.SingleOrDefault(field => field.Id == id)
            ?? throw new DomainRuleException("Field was not found.");
    }

    private static FieldChoice FindChoice(IEnumerable<FieldChoice> choices, Guid id)
    {
        return choices.SingleOrDefault(choice => choice.Id == id)
            ?? throw new DomainRuleException("Choice was not found.");
    }

    private static void EnsureUniqueName(IEnumerable<FieldDefinition> fields, FieldDefinition candidate)
    {
        var duplicate = fields.Any(field => field.Id != candidate.Id && !field.IsArchived &&
            !candidate.IsArchived && (field.ProjectId is null || candidate.ProjectId is null ||
            field.ProjectId == candidate.ProjectId) &&
            string.Equals(field.DisplayName, candidate.DisplayName, StringComparison.OrdinalIgnoreCase));

        if (duplicate)
        {
            throw new DomainRuleException("Field name is already visible in this project.");
        }
    }

    private static void EnsureUniqueChoice(IEnumerable<FieldChoice> choices, FieldChoice candidate)
    {
        if (choices.Any(choice => choice.Id != candidate.Id && !choice.IsArchived &&
            !candidate.IsArchived && string.Equals(choice.Label, candidate.Label, StringComparison.OrdinalIgnoreCase)))
        {
            throw new DomainRuleException("Choice label is already used by this field.");
        }
    }

    private static void ValidateOrder(IEnumerable<Guid> available, IReadOnlyList<Guid> ids)
    {
        var expected = available.ToHashSet();

        if (expected.Count != ids.Count || !expected.SetEquals(ids))
        {
            throw new DomainRuleException("Order must contain every row exactly once.");
        }
    }

    private static void EnsureChoiceField(FieldDefinition field)
    {
        if (field.DataType != FieldDataType.Choice || field.IsArchived)
        {
            throw new DomainRuleException("Choices require an active choice field.");
        }
    }

    private static async Task EnsureProjectAsync(IUnitOfWork work, Guid? projectId, CancellationToken cancellationToken)
    {
        if (projectId is Guid id && await work.Projects.FindAsync(id, false, cancellationToken) is null)
        {
            throw new DomainRuleException("Project is missing or deleted.");
        }
    }
}