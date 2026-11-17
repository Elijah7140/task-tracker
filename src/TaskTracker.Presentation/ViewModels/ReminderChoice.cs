using TaskTracker.Core.Reminders;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>A selectable reminder option in the editor or settings.</summary>
public sealed record ReminderChoice(string Label, ReminderMode? Mode = null, TimeSpan? Offset = null)
{
    public int? OffsetMinutes => (int?)Offset?.TotalMinutes;

    public static IReadOnlyList<ReminderChoice> OffsetOptions { get; } =
        Array.AsReadOnly<ReminderChoice>(
        [
            OffsetOption("At the due moment", 0),
            OffsetOption("5 minutes before", 5),
            OffsetOption("15 minutes before", 15),
            OffsetOption("30 minutes before", 30),
            OffsetOption("1 hour before", 60),
            OffsetOption("2 hours before", 120),
            OffsetOption("1 day before", 1440),
            OffsetOption("2 days before", 2880),
            OffsetOption("1 week before", 10080),
        ]);

    public static IReadOnlyList<ReminderChoice> Options { get; } =
        Array.AsReadOnly<ReminderChoice>(
        [
            new("Default"),
            new("None", ReminderMode.None),
            ..OffsetOptions,
        ]);

    private static ReminderChoice OffsetOption(string label, int minutes)
    {
        return new ReminderChoice(label, ReminderMode.Offset, TimeSpan.FromMinutes(minutes));
    }
}