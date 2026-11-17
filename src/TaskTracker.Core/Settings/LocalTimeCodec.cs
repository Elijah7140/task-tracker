using System.Globalization;

namespace TaskTracker.Core.Settings;

/// <summary>Stores local times as invariant 24-hour clock text.</summary>
public sealed class LocalTimeCodec : ISettingCodec<TimeOnly>
{
    public TimeOnly Parse(string text)
    {
        if (!TimeOnly.TryParseExact(text, ["HH:mm", "HH:mm:ss", "HH:mm:ss.FFFFFFF"],
            CultureInfo.InvariantCulture, DateTimeStyles.None, out var time))
        {
            throw new FormatException("Expected a local time in HH:mm or HH:mm:ss format.");
        }

        return time;
    }

    public string Format(TimeOnly value)
    {
        return value.ToString("HH:mm:ss.FFFFFFF", CultureInfo.InvariantCulture);
    }
}