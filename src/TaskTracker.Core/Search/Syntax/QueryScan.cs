namespace TaskTracker.Core.Search.Syntax;

/// <summary>The terms found in query text: free-text words, field clauses and scanning errors.</summary>
internal sealed record QueryScan(
    IReadOnlyList<string> Words, IReadOnlyList<QueryClause> Clauses, IReadOnlyList<QueryParseError> Errors);