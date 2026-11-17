namespace TaskTracker.Core.Search;

/// <summary>Executes a validated search in storage.</summary>
public interface IItemSearch
{
    Task<ItemSearchResults> SearchAsync(ItemQuery query, IReadOnlyList<SearchableField> fields,
        int limit, CancellationToken cancellationToken);
}