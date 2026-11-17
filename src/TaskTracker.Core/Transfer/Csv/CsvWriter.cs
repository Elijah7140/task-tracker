using System.Text;

namespace TaskTracker.Core.Transfer.Csv;

/// <summary>Writes rows as RFC 4180 text: comma separated, CRLF line ends, quotes doubled.</summary>
internal static class CsvWriter
{
    private const string LineEnd = "\r\n";

    public static string Write(IEnumerable<IReadOnlyList<string>> rows)
    {
        var text = new StringBuilder();

        foreach (var row in rows)
        {
            text.Append(string.Join(',', row.Select(Escape)));
            text.Append(LineEnd);
        }

        return text.ToString();
    }

    /// <summary>
    /// Quotes a cell when it holds a comma, quote or line break, or starts or ends with a space or tab
    /// (which a reader might otherwise trim).
    /// </summary>
    public static string Escape(string cell)
    {
        return NeedsQuotes(cell) ? $"\"{cell.Replace("\"", "\"\"")}\"" : cell;
    }

    private static bool NeedsQuotes(string cell)
    {
        if (cell.Length == 0)
        {
            return false;
        }

        var hasSpecialCharacter = cell.AsSpan().IndexOfAny(",\"\r\n") >= 0;
        var hasEdgeWhitespace = cell[0] is ' ' or '\t' || cell[^1] is ' ' or '\t';

        return hasSpecialCharacter || hasEdgeWhitespace;
    }
}