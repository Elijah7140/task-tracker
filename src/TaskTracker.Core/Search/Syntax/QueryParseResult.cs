namespace TaskTracker.Core.Search.Syntax;

/// <summary>The outcome of parsing query text: the query parts, or the errors that stopped it.</summary>
/// <param name="Text">The free-text words joined by single spaces, or null when there are none.</param>
/// <param name="Filters">The field conditions in the order they were written.</param>
/// <param name="StableText">
/// The same query rewritten so it survives renames: choices appear as <c>#id</c>, dates as typed
/// (so <c>today</c> stays relative). This is the text saved searches store.
/// </param>
/// <param name="DisplayText">
/// The same query as the user would read it: choices by label, dates as typed. Parsing it again
/// gives the same filters; it is what the search box shows for an opened saved search.
/// </param>
/// <param name="ImpliesIncludeCompleted">True when the query asks for completed items (<c>is:done</c>).</param>
/// <param name="Errors">Every problem found, ordered by position; empty on success.</param>
public sealed record QueryParseResult(
    string? Text,
    IReadOnlyList<FieldFilter> Filters,
    string StableText,
    string DisplayText,
    bool ImpliesIncludeCompleted,
    IReadOnlyList<QueryParseError> Errors)
{
    /// <summary>True when the text parsed without errors.</summary>
    public bool Succeeded => Errors.Count == 0;

    internal static QueryParseResult Failure(IReadOnlyList<QueryParseError> errors)
    {
        return new QueryParseResult(null, [], string.Empty, string.Empty, false, errors);
    }
}