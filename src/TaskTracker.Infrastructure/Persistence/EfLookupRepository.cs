using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Lookups;
using TaskTracker.Core.Persistence;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>EF lookup list queries and tracking.</summary>
public sealed class EfLookupRepository(TaskTrackerDbContext database) : ILookupRepository
{
    public async Task<IReadOnlyList<ItemType>> ItemTypesAsync(CancellationToken cancellationToken)
    {
        return await database.ItemTypes.OrderBy(itemType => itemType.SortOrder).ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<PriorityLevel>> PriorityLevelsAsync(CancellationToken cancellationToken)
    {
        return await database.PriorityLevels.OrderBy(level => level.SortOrder).ToListAsync(cancellationToken);
    }

    public void Add(ItemType itemType)
    {
        database.ItemTypes.Add(itemType);
    }

    public void Add(PriorityLevel priorityLevel)
    {
        database.PriorityLevels.Add(priorityLevel);
    }
}