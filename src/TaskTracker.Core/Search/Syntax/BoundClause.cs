namespace TaskTracker.Core.Search.Syntax;

/// <summary>A clause matched to a field: the filter it means, with its stable and display spellings.</summary>
internal sealed record BoundClause(FieldFilter Filter, string StableText, string DisplayText);