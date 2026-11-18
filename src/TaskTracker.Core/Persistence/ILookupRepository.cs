using TaskTracker.Core.Lookups;

namespace TaskTracker.Core.Persistence;

/// <summary>Loads and tracks editable lookup lists.</summary>
public interface ILookupRepository
{
    Task<IReadOnlyList<ItemType>> ItemTypesAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<PriorityLevel>> PriorityLevelsAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<StatusLevel>> StatusesAsync(CancellationToken cancellationToken);

    void Add(StatusLevel status);

    void Add(ItemType itemType);

    void Add(PriorityLevel priorityLevel);
}