using TaskTracker.Core.Calendar;
using TaskTracker.Core.Urgency;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>Builds calendar entries for tests, naming only the values a test cares about.</summary>
internal static class CalendarEntries
{
    internal static CalendarEntry Due(DateOnly date, string title = "Due item", TimeOnly? time = null,
        Guid? itemId = null, bool isCompleted = false, string? itemType = null, string? priority = null,
        UrgencyThresholds? thresholds = null)
    {
        var entry = new CalendarEntry(
            ItemId: itemId ?? Guid.NewGuid(),
            ProjectId: Guid.NewGuid(),
            FolderId: null,
            Title: title,
            Kind: CalendarEntryKind.Due,
            Date: date,
            StartTime: time,
            ScheduledStart: null,
            ScheduledEnd: null,
            IsCompleted: isCompleted,
            DueDate: date,
            DueTime: time,
            ItemType: itemType,
            Priority: priority);
        return WithThresholds(entry, thresholds);
    }

    internal static CalendarEntry Scheduled(DateTime start, DateTime? end, string title = "Block",
        Guid? itemId = null, bool isCompleted = false, UrgencyThresholds? thresholds = null)
    {
        var entry = new CalendarEntry(
            ItemId: itemId ?? Guid.NewGuid(),
            ProjectId: Guid.NewGuid(),
            FolderId: null,
            Title: title,
            Kind: CalendarEntryKind.Scheduled,
            Date: DateOnly.FromDateTime(start),
            StartTime: TimeOnly.FromDateTime(start),
            ScheduledStart: start,
            ScheduledEnd: end,
            IsCompleted: isCompleted,
            DueDate: null,
            DueTime: null,
            ItemType: null,
            Priority: null);
        return WithThresholds(entry, thresholds);
    }

    private static CalendarEntry WithThresholds(CalendarEntry entry, UrgencyThresholds? thresholds)
    {
        return thresholds is null ? entry : entry with { Thresholds = thresholds };
    }
}