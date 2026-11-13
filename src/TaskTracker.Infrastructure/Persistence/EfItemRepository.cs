using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Items;
using TaskTracker.Core.Persistence;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>EF item queries that retain deleted descendants.</summary>
public sealed class EfItemRepository(TaskTrackerDbContext database) : IItemRepository
{
    public async Task<IReadOnlyList<TodoItem>> LoadAreaAsync(Guid projectId, Guid? folderId, CancellationToken cancellationToken)
    {
        return await database.TodoItems.IgnoreQueryFilters()
            .Where(item => item.ProjectId == projectId && item.FolderId == folderId)
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<TodoItem>> LoadProjectAsync(Guid projectId, CancellationToken cancellationToken)
    {
        return await database.TodoItems.IgnoreQueryFilters()
            .Where(item => item.ProjectId == projectId)
            .ToListAsync(cancellationToken);
    }

    public Task<TodoItem?> FindAsync(Guid id, CancellationToken cancellationToken)
    {
        return database.TodoItems.FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
    }

    public void Add(TodoItem item)
    {
        database.TodoItems.Add(item);
    }
}