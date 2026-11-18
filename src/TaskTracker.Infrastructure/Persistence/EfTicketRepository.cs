using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Items;
using TaskTracker.Core.Tickets;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>Queries open tickets in active projects and areas.</summary>
public sealed class EfTicketRepository(TaskTrackerDbContext database) : ITicketRepository
{
    public async Task<IReadOnlyList<TodoItem>> LoadAsync(Guid? projectId, CancellationToken cancellationToken)
    {
        var query = database.TodoItems.Where(item => item.CompletedAtUtc == null && item.TicketNumber != null
            && database.Projects.Any(project => project.Id == item.ProjectId)
            && (item.FolderId == null || database.Folders.Any(folder => folder.Id == item.FolderId)));

        if (projectId is Guid id)
        {
            query = query.Where(item => item.ProjectId == id);
        }

        return await query.ToListAsync(cancellationToken);
    }
}