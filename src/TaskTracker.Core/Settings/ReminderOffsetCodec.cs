namespace TaskTracker.Core.Settings;

/// <summary>Stores nonnegative reminder offsets as ISO-8601 durations.</summary>
public sealed class ReminderOffsetCodec : ISettingCodec<TimeSpan>
{
    private readonly DurationCodec duration = new();

    public TimeSpan Parse(string text)
    {
        var value = duration.Parse(text);
        return value >= TimeSpan.Zero ? value : throw new FormatException("Reminder offsets must be nonnegative.");
    }

    public string Format(TimeSpan value)
    {
        return value >= TimeSpan.Zero ? duration.Format(value) : throw new DomainRuleException("Reminder offsets must be nonnegative.");
    }
}