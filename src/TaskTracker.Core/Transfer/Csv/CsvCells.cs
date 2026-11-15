namespace TaskTracker.Core.Transfer.Csv;

/// <summary>
/// Guards text cells against spreadsheet formula injection (§7.9). A cell that starts with <c>=</c>, <c>+</c>,
/// <c>-</c>, <c>@</c>, a tab or a carriage return would be run as a formula by Excel, so an export puts an
/// apostrophe in front, and an import takes exactly that apostrophe off again.
/// </summary>
internal static class CsvCells
{
    private const char Apostrophe = '\'';
    private const string FormulaStarts = "=+-@\t\r";

    /// <summary>Prefixes an apostrophe when the text (ignoring leading apostrophes) starts like a formula.</summary>
    public static string Protect(string text)
    {
        return IsRisky(text) ? Apostrophe + text : text;
    }

    /// <summary>
    /// Removes the one apostrophe that <see cref="Protect"/> adds. A leading apostrophe that is not followed
    /// by a formula start (ignoring further apostrophes) is the user's own and stays.
    /// </summary>
    public static string Unprotect(string text)
    {
        if (text.Length > 1 && text[0] == Apostrophe && IsRisky(text[1..]))
        {
            return text[1..];
        }

        return text;
    }

    private static bool IsRisky(string text)
    {
        var rest = text.TrimStart(Apostrophe);

        return rest.Length > 0 && FormulaStarts.Contains(rest[0]);
    }
}