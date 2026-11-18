using TaskTracker.Core.Items.Recurrence;
using TaskTracker.Core.Reminders;

namespace TaskTracker.Core.Items;

/// <summary>Named replacement values for an item edit.</summary>
public sealed record ItemEdit(
    string Title,
    string? Description,
    string? TicketNumber,
    Guid? ItemTypeId,
    Guid? PriorityLevelId,
    DateOnly? DueDate,
    TimeOnly? DueTime,
    DateTime? ScheduledStart,
    DateTime? ScheduledEnd)
{
    /// <summary>When true, applies the draft recurrence, including an explicit removal.</summary>
    public bool UpdateRecurrence { get; init; }

    public RecurrenceRule? Recurrence { get; init; }

    /// <summary>When true, applies the reminder choice, including resetting to Default.</summary>
    public bool UpdateReminder { get; init; }

    public ReminderMode? ReminderMode { get; init; }

    public int? ReminderOffsetMinutes { get; init; }
}