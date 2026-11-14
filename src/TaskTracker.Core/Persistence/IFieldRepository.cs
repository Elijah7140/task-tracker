using TaskTracker.Core.Fields;

namespace TaskTracker.Core.Persistence;

/// <summary>Queries and tracks custom field definitions, choices, and item values.</summary>
public interface IFieldRepository
{
    Task<IReadOnlyList<FieldDefinition>> DefinitionsAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<FieldChoice>> ChoicesAsync(Guid fieldId, CancellationToken cancellationToken);

    Task<IReadOnlyList<ItemFieldValue>> ValuesAsync(Guid itemId, CancellationToken cancellationToken);

    Task<bool> HasValuesAsync(Guid fieldId, CancellationToken cancellationToken);

    void Add(FieldDefinition field);

    void Add(FieldChoice choice);

    void Add(ItemFieldValue value);

    void Remove(ItemFieldValue value);
}