namespace TaskTracker.Core.Search;

/// <summary>Executes validated item queries for presentation clients.</summary>
public interface IItemSearchService
{
    /// <summary>
    /// Validates the query and returns at most <paramref name="limit"/> matches.
    /// Throws <see cref="DomainRuleException"/> when the query is invalid.
    /// </summary>
    Task<ItemSearchResults> SearchAsync(
        ItemQuery query, int limit = 200, CancellationToken cancellationToken = default);
}