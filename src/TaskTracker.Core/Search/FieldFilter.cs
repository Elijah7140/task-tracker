namespace TaskTracker.Core.Search;

/// <summary>One condition in a search query.</summary>
public sealed record FieldFilter(string FieldKey, FilterOperator Operator, FilterValue? Value);