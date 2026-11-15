using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Persistence;
using TaskTracker.Core.SavedSearches;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>EF storage for saved searches.</summary>
public sealed class EfSavedSearchRepository(TaskTrackerDbContext database) : ISavedSearchRepository
{
    public async Task<IReadOnlyList<SavedSearch>> ListAsync(CancellationToken cancellationToken)
    {
        var all = await database.SavedSearches.ToListAsync(cancellationToken);
        return all.OrderBy(search => search.SortOrder)
            .ThenBy(search => search.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public async Task<SavedSearch?> FindAsync(Guid id, CancellationToken cancellationToken)
    {
        return await database.SavedSearches.FirstOrDefaultAsync(search => search.Id == id, cancellationToken);
    }

    public void Add(SavedSearch search)
    {
        database.SavedSearches.Add(search);
    }

    public void Remove(SavedSearch search)
    {
        database.SavedSearches.Remove(search);
    }
}