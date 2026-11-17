namespace TaskTracker.Core.Items.Recurrence;

/// <summary>How a repeat stops generating occurrences.</summary>
public enum RecurrenceEndKind
{
    Never = 1,
    OnDate,
    AfterCount
}