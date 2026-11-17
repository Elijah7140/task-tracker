namespace TaskTracker.Core.Search;

/// <summary>Search conditions whose filters are combined with AND.</summary>
public sealed record ItemQuery(SearchScope Scope, string? Text, IReadOnlyList<FieldFilter> Filters, bool IncludeCompleted);