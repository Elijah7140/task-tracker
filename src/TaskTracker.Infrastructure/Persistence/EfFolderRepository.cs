using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Persistence;
using TaskTracker.Core.Projects;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>EF folder queries and tracking.</summary>
public sealed class EfFolderRepository(TaskTrackerDbContext database) : IFolderRepository
{
    public async Task<IReadOnlyList<Folder>> ListAsync(Guid projectId, bool includeDeleted, CancellationToken cancellationToken)
    {
        var query = includeDeleted ? database.Folders.IgnoreQueryFilters() : database.Folders;
        return await query.Where(folder => folder.ProjectId == projectId).ToListAsync(cancellationToken);
    }

    public void Add(Folder folder)
    {
        database.Folders.Add(folder);
    }
}