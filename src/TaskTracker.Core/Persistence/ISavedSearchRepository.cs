using TaskTracker.Core.SavedSearches;

namespace TaskTracker.Core.Persistence;

/// <summary>Stores saved searches inside one unit of work.</summary>
public interface ISavedSearchRepository
{
    /// <summary>All saved searches ordered by sort order, then name.</summary>
    Task<IReadOnlyList<SavedSearch>> ListAsync(CancellationToken cancellationToken);

    Task<SavedSearch?> FindAsync(Guid id, CancellationToken cancellationToken);

    void Add(SavedSearch search);

    void Remove(SavedSearch search);
}