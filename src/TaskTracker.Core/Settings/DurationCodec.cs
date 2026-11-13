using System.Xml;

namespace TaskTracker.Core.Settings;

/// <summary>Stores durations in ISO-8601 format.</summary>
public sealed class DurationCodec : ISettingCodec<TimeSpan>
{
    public TimeSpan Parse(string text)
    {
        try
        {
            return XmlConvert.ToTimeSpan(text);
        }
        catch (Exception exception) when (exception is FormatException or ArgumentException)
        {
            throw new FormatException("Expected an ISO-8601 duration.", exception);
        }
    }

    public string Format(TimeSpan value)
    {
        return XmlConvert.ToString(value);
    }
}