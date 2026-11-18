using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Fields;
using TaskTracker.Core.Persistence;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>EF storage for custom fields and typed item values.</summary>
public sealed class EfFieldRepository(TaskTrackerDbContext database) : IFieldRepository
{
    public async Task<IReadOnlyList<FieldDefinition>> DefinitionsAsync(CancellationToken cancellationToken)
    {
        return await database.FieldDefinitions.OrderBy(field => field.SortOrder).ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<FieldChoice>> ChoicesAsync(Guid fieldId, CancellationToken cancellationToken)
    {
        return await database.FieldChoices.Where(choice => choice.FieldDefinitionId == fieldId)
            .OrderBy(choice => choice.SortOrder).ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<ItemFieldValue>> ValuesAsync(Guid itemId, CancellationToken cancellationToken)
    {
        await database.ItemFieldValues.Where(value => value.ItemId == itemId).LoadAsync(cancellationToken);
        return database.ItemFieldValues.Local.Where(value => value.ItemId == itemId).ToList();
    }

    public async Task<bool> HasValuesAsync(Guid fieldId, CancellationToken cancellationToken)
    {
        return await database.ItemFieldValues.AnyAsync(value => value.FieldDefinitionId == fieldId, cancellationToken);
    }

    public async Task<IReadOnlyList<FieldChoice>> AllChoicesAsync(CancellationToken cancellationToken)
    {
        return await database.FieldChoices.OrderBy(choice => choice.SortOrder).ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<ItemFieldValue>> ValuesForProjectAsync(Guid projectId, CancellationToken cancellationToken)
    {
        var projectItemIds = database.TodoItems.Where(item => item.ProjectId == projectId).Select(item => item.Id);

        return await database.ItemFieldValues
            .Where(value => projectItemIds.Contains(value.ItemId))
            .ToListAsync(cancellationToken);
    }

    public void Add(FieldDefinition field)
    {
        database.FieldDefinitions.Add(field);
    }

    public void Add(FieldChoice choice)
    {
        database.FieldChoices.Add(choice);
    }

    public void Add(ItemFieldValue value)
    {
        database.ItemFieldValues.Add(value);
    }

    public void Remove(ItemFieldValue value)
    {
        database.ItemFieldValues.Remove(value);
    }
}