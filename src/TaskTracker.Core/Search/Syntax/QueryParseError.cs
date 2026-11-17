namespace TaskTracker.Core.Search.Syntax;

/// <summary>A problem found in query text, with where it is.</summary>
/// <param name="Position">Zero-based index of the first character of the offending token.</param>
/// <param name="Length">Number of characters in the offending token.</param>
/// <param name="Message">What is wrong, in words a user can act on.</param>
public sealed record QueryParseError(int Position, int Length, string Message)
{
    /// <summary>Describes the error, quoting the offending token from <paramref name="queryText"/>.</summary>
    public string Describe(string queryText)
    {
        var start = Math.Min(Position, queryText.Length);
        var length = Math.Min(Length, queryText.Length - start);
        var token = queryText.Substring(start, length);
        return $"{Message} (at \"{token}\", character {Position + 1})";
    }
}