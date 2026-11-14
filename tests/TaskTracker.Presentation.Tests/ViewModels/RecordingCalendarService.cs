using TaskTracker.Core.Calendar;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>Answers every calendar load at once with the configured entries and records the queries.</summary>
internal sealed class RecordingCalendarService : ICalendarService
{
    public List<CalendarQuery> Queries { get; } = [];

    public IReadOnlyList<CalendarEntry> Entries { get; set; } = [];

    public Task<IReadOnlyList<CalendarEntry>> LoadAsync(CalendarQuery query,
        CancellationToken cancellationToken = default)
    {
        Queries.Add(query);
        return Task.FromResult(Entries);
    }
}