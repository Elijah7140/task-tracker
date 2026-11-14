namespace TaskTracker.Core.Search;

/// <summary>A bounded page of search results.</summary>
public sealed record ItemSearchResults(IReadOnlyList<ItemSearchResult> Items, bool HasMore);