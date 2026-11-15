namespace TaskTracker.Core.Search.Syntax;

/// <summary>Quotes and escapes words so the scanner reads them back unchanged.</summary>
internal static class QueryQuoting
{
    private const string SpecialCharacters = "\"\\:~<>!";

    /// <summary>Returns the value as written, wrapped in quotes only when it would otherwise be misread.</summary>
    public static string QuoteIfNeeded(string value)
    {
        return NeedsQuotes(value) ? Quote(value) : value;
    }

    /// <summary>Quotes choice labels that would otherwise be read as choice ids.</summary>
    public static string QuoteChoiceLabel(string value)
    {
        if (value.StartsWith('#') && Guid.TryParse(value.AsSpan(1), out _))
        {
            return Quote(value);
        }

        return QuoteIfNeeded(value);
    }

    /// <summary>Wraps the value in quotes, escaping embedded quotes and backslashes.</summary>
    public static string Quote(string value)
    {
        var escaped = value.Replace("\\", "\\\\").Replace("\"", "\\\"");
        return $"\"{escaped}\"";
    }

    private static bool NeedsQuotes(string value)
    {
        if (value.Length == 0 || value.Contains("..", StringComparison.Ordinal))
        {
            return true;
        }

        return value.Any(character => char.IsWhiteSpace(character) || SpecialCharacters.Contains(character));
    }
}