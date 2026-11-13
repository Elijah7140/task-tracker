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
    DateTime? ScheduledEnd);