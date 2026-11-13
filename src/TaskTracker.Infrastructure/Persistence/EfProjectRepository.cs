using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Persistence;
using TaskTracker.Core.Projects;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>EF project queries and tracking.</summary>
public sealed class EfProjectRepository(TaskTrackerDbContext database) : IProjectRepository
{
    public async Task<IReadOnlyList<Project>> ListAsync(bool includeDeleted, CancellationToken cancellationToken)
    {
        var query = includeDeleted ? database.Projects.IgnoreQueryFilters() : database.Projects;
        return await query.OrderBy(project => project.SortOrder).ToListAsync(cancellationToken);
    }

    public Task<Project?> FindAsync(Guid id, bool includeDeleted, CancellationToken cancellationToken)
    {
        var query = includeDeleted ? database.Projects.IgnoreQueryFilters() : database.Projects;
        return query.FirstOrDefaultAsync(project => project.Id == id, cancellationToken);
    }

    public void Add(Project project)
    {
        database.Projects.Add(project);
    }
}