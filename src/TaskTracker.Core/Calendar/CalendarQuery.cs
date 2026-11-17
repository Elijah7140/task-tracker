namespace TaskTracker.Core.Calendar;

/// <summary>A bounded calendar request, optionally limited to one project.</summary>
public sealed record CalendarQuery(Guid? ProjectId, DateOnly FromDate, DateOnly ToDateExclusive, bool IncludeCompleted);