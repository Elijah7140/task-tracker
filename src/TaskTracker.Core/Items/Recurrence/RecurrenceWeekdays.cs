namespace TaskTracker.Core.Items.Recurrence;

/// <summary>Selected days in a Monday-first recurrence week.</summary>
[Flags]
public enum RecurrenceWeekdays
{
    None = 0,
    Monday = 1,
    Tuesday = 2,
    Wednesday = 4,
    Thursday = 8,
    Friday = 16,
    Saturday = 32,
    Sunday = 64,
    All = 127
}