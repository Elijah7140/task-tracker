using TaskTracker.Core.Fields;

namespace TaskTracker.Core.Persistence;

/// <summary>Queries and tracks custom field definitions, choices, and item values.</summary>
public interface IFieldRepository
{
    Task<IReadOnlyList<FieldDefinition>> DefinitionsAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<FieldChoice>> ChoicesAsync(Guid fieldId, CancellationToken cancellationToken);

    /// <summary>Gets the item's custom values as of the current unit of work, including pending edits.</summary>
    Task<IReadOnlyList<ItemFieldValue>> ValuesAsync(Guid itemId, CancellationToken cancellationToken);

    Task<bool> HasValuesAsync(Guid fieldId, CancellationToken cancellationToken);

    /// <summary>Every choice of every field, archived ones included, ordered by sort order.</summary>
    Task<IReadOnlyList<FieldChoice>> AllChoicesAsync(CancellationToken cancellationToken);

    /// <summary>The custom values of the active items of one project.</summary>
    Task<IReadOnlyList<ItemFieldValue>> ValuesForProjectAsync(Guid projectId, CancellationToken cancellationToken);

    void Add(FieldDefinition field);

    void Add(FieldChoice choice);

    void Add(ItemFieldValue value);

    void Remove(ItemFieldValue value);
}