using TaskTracker.Core.Items.Recurrence;

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
}