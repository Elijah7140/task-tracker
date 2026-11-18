using System.Globalization;

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

    /// <summary>
    /// Writes a choice value. A numbered priority is written as its number; a priority named like a
    /// number is quoted so it is not read back as a number (§7.15).
    /// </summary>
    public static string FormatChoice(SearchChoice choice, string fieldKey)
    {
        if (fieldKey != "priority")
        {
            return QuoteChoiceLabel(choice.Label);
        }

        if (choice.Number is int number)
        {
            return number.ToString(CultureInfo.InvariantCulture);
        }

        return IsPriorityNumber(choice.Label, out _) ? Quote(choice.Label) : QuoteChoiceLabel(choice.Label);
    }

    /// <summary>Whether the text is a whole number of at least 1, the form of a priority number.</summary>
    public static bool IsPriorityNumber(string value, out int number)
    {
        return int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out number) && number >= 1;
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