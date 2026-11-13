namespace TaskTracker.Core.Urgency;

/// <summary>Deadline windows with yellow defensively clamped to red.</summary>
public sealed record UrgencyThresholds
{
    public UrgencyThresholds(TimeSpan yellow, TimeSpan red)
    {
        if (yellow < TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(yellow), "Yellow threshold cannot be negative.");
        }

        if (red < TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(red), "Red threshold cannot be negative.");
        }

        Red = red;
        Yellow = yellow < red ? red : yellow;
    }

    public TimeSpan Yellow { get; }

    public TimeSpan Red { get; }
}