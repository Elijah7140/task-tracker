namespace TaskTracker.Core.Transfer.Json;

/// <summary>
/// Reads the date and time strings of an import document. Absent text is null; the validators have
/// already rejected malformed text, so the writers only ever see valid values.
/// </summary>
internal static class ImportParse
{
    public static DateOnly? Date(string? text)
    {
        return TransferTimeFormat.TryParseDate(text, out var value) ? value : null;
    }

    public static TimeOnly? Time(string? text)
    {
        return TransferTimeFormat.TryParseTime(text, out var value) ? value : null;
    }

    public static DateTime? Local(string? text)
    {
        return TransferTimeFormat.TryParseLocal(text, out var value) ? value : null;
    }

    public static DateTime? Utc(string? text)
    {
        return TransferTimeFormat.TryParseUtc(text, out var value) ? value : null;
    }
}