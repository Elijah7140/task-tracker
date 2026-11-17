using TaskTracker.Core.Reminders;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>A selectable reminder option in the item draft.</summary>
public sealed record ReminderChoice(string Label, ReminderMode? Mode = null, int? OffsetMinutes = null)
{
    public static IReadOnlyList<ReminderChoice> Options { get; } =
        Array.AsReadOnly<ReminderChoice>(
        [
            new("Default"),
            new("None", ReminderMode.None),
            new("At the due moment", ReminderMode.Offset, 0),
            new("5 minutes before", ReminderMode.Offset, 5),
            new("15 minutes before", ReminderMode.Offset, 15),
            new("30 minutes before", ReminderMode.Offset, 30),
            new("1 hour before", ReminderMode.Offset, 60),
            new("2 hours before", ReminderMode.Offset, 120),
            new("1 day before", ReminderMode.Offset, 1440),
            new("2 days before", ReminderMode.Offset, 2880),
            new("1 week before", ReminderMode.Offset, 10080),
        ]);
}