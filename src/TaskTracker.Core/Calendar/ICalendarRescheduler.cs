namespace TaskTracker.Core.Calendar;

/// <summary>Changes the dates and times of items shown on the calendar.</summary>
public interface ICalendarRescheduler
{
    /// <summary>
    /// Sets an item's due date and optional due time. A null time makes the item due all day.
    /// Fails with <see cref="DomainRuleException"/> when the item is missing or deleted.
    /// </summary>
    Task MoveDueAsync(Guid itemId, DateOnly date, TimeOnly? time,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Moves an item's schedule so it starts at <paramref name="newStart"/>, keeping its length.
    /// A schedule without an end stays without an end. Fails with <see cref="DomainRuleException"/>
    /// when the item is missing, deleted, or has no schedule.
    /// </summary>
    Task MoveScheduleAsync(Guid itemId, DateTime newStart,
        CancellationToken cancellationToken = default);
}