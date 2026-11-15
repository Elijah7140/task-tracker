using System.Globalization;

namespace TaskTracker.Core.Transfer;

/// <summary>
/// Writes and reads dates and times in the invariant ISO forms used by both file formats (§7.9).
/// Floating local values carry no offset; UTC timestamps end with <c>Z</c>.
/// </summary>
public static class TransferTimeFormat
{
    private const string DateFormat = "yyyy-MM-dd";
    private const string LocalFormat = "yyyy-MM-dd'T'HH:mm:ss.FFFFFFF";
    private const string UtcFormat = "yyyy-MM-dd'T'HH:mm:ss.FFFFFFF'Z'";

    private static readonly string[] TimeFormats = ["HH:mm", "HH:mm:ss", "HH:mm:ss.FFFFFFF"];

    private static readonly string[] LocalFormats =
    [
        "yyyy-MM-dd'T'HH:mm",
        "yyyy-MM-dd'T'HH:mm:ss",
        "yyyy-MM-dd'T'HH:mm:ss.FFFFFFF",
        "yyyy-MM-dd HH:mm",
        "yyyy-MM-dd HH:mm:ss",
        "yyyy-MM-dd HH:mm:ss.FFFFFFF"
    ];

    /// <summary>Formats a date as <c>yyyy-MM-dd</c>.</summary>
    public static string FormatDate(DateOnly date)
    {
        return date.ToString(DateFormat, CultureInfo.InvariantCulture);
    }

    /// <summary>Formats a time of day as <c>HH:mm:ss</c>, with a fraction only when there is one.</summary>
    public static string FormatTime(TimeOnly time)
    {
        var format = time.Ticks % TimeSpan.TicksPerSecond == 0 ? "HH:mm:ss" : "HH:mm:ss.FFFFFFF";
        return time.ToString(format, CultureInfo.InvariantCulture);
    }

    /// <summary>Formats a floating local date and time without any offset.</summary>
    public static string FormatLocal(DateTime value)
    {
        return value.ToString(LocalFormat, CultureInfo.InvariantCulture);
    }

    /// <summary>Formats a UTC timestamp with a trailing <c>Z</c>.</summary>
    public static string FormatUtc(DateTime value)
    {
        return value.ToString(UtcFormat, CultureInfo.InvariantCulture);
    }

    /// <summary>Reads <c>yyyy-MM-dd</c>.</summary>
    public static bool TryParseDate(string? text, out DateOnly date)
    {
        return DateOnly.TryParseExact(text?.Trim(), DateFormat, CultureInfo.InvariantCulture,
            DateTimeStyles.None, out date);
    }

    /// <summary>Reads <c>HH:mm</c> or <c>HH:mm:ss</c>.</summary>
    public static bool TryParseTime(string? text, out TimeOnly time)
    {
        return TimeOnly.TryParseExact(text?.Trim(), TimeFormats, CultureInfo.InvariantCulture,
            DateTimeStyles.None, out time);
    }

    /// <summary>Reads a floating local date and time; a <c>T</c> or a space may separate date and time.</summary>
    public static bool TryParseLocal(string? text, out DateTime value)
    {
        return DateTime.TryParseExact(text?.Trim(), LocalFormats, CultureInfo.InvariantCulture,
            DateTimeStyles.None, out value);
    }

    /// <summary>Reads a UTC timestamp that ends with <c>Z</c>.</summary>
    public static bool TryParseUtc(string? text, out DateTime value)
    {
        const DateTimeStyles styles = DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal;
        return DateTime.TryParseExact(text?.Trim(), UtcFormat, CultureInfo.InvariantCulture, styles, out value);
    }
}