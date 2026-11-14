namespace TaskTracker.Core.Calendar;

/// <summary>Loads one calendar period for a presentation client.</summary>
public interface ICalendarService
{
    Task<IReadOnlyList<CalendarEntry>> LoadAsync(CalendarQuery query,
        CancellationToken cancellationToken = default);
}