namespace TaskTracker.Core.Search;

/// <summary>Converts user text into safe prefix phrases for SQLite FTS5.</summary>
public static class FtsTermBuilder
{
    public static string? Build(string? text)
    {
        var terms = text?.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)
            .Where(term => term.Any(char.IsLetterOrDigit)).ToArray();

        if (terms is null || terms.Length == 0)
        {
            return null;
        }

        return string.Join(" AND ", terms.Select(term => $"\"{term.Replace("\"", "\"\"")}\"*"));
    }
}