namespace TaskTracker.Core.Search.Syntax;

/// <summary>A <c>key operator value</c> term as written, before it is matched to a field.</summary>
/// <param name="Start">Index of the term's first character.</param>
/// <param name="Length">Length of the whole term.</param>
/// <param name="Key">The key exactly as typed.</param>
/// <param name="Symbol">One of <c>:</c> <c>!=</c> <c>&gt;</c> <c>&lt;</c> <c>&gt;=</c> <c>&lt;=</c> <c>~</c>.</param>
/// <param name="Endpoints">One value, or two for a <c>a..b</c> range.</param>
internal sealed record QueryClause(
    int Start, int Length, string Key, string Symbol, IReadOnlyList<QueryEndpoint> Endpoints);