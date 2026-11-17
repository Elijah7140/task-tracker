namespace TaskTracker.Core.Calendar;

/// <summary>Reads calendar entries within a date range.</summary>
public interface ICalendarRepository
{
    /// <summary>
    /// Returns the due and scheduled entries of active items that fall in the range. A schedule
    /// whose end is missing or not after its start counts as a block of
    /// <see cref="CalendarEntry.DefaultBlockLength"/>.
    /// </summary>
    Task<IReadOnlyList<CalendarEntry>> LoadAsync(CalendarQuery query, CancellationToken cancellationToken);
}