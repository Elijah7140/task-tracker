using TaskTracker.Core.Lookups;

namespace TaskTracker.Core.Persistence;

/// <summary>Loads and tracks editable lookup lists.</summary>
public interface ILookupRepository
{
    Task<IReadOnlyList<ItemType>> ItemTypesAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<PriorityLevel>> PriorityLevelsAsync(CancellationToken cancellationToken);

    void Add(ItemType itemType);

    void Add(PriorityLevel priorityLevel);
}