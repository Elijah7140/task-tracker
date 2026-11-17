using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Calendar;
using TaskTracker.Core.Items;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>Queries active items and their calendar fields in SQLite.</summary>
public sealed class EfCalendarRepository(TaskTrackerDbContext database) : ICalendarRepository
{
    public async Task<IReadOnlyList<CalendarEntry>> LoadAsync(CalendarQuery query, CancellationToken cancellationToken)
    {
        var start = query.FromDate.ToDateTime(TimeOnly.MinValue);
        var end = query.ToDateExclusive.ToDateTime(TimeOnly.MinValue);
        var earliestDefaultBlockStart = start - CalendarEntry.DefaultBlockLength;
        var items = await database.TodoItems.AsNoTracking()
            .Where(item => query.ProjectId == null || item.ProjectId == query.ProjectId)
            .Where(item => query.IncludeCompleted || item.CompletedAtUtc == null)
            .Where(item => (item.DueDate >= query.FromDate && item.DueDate < query.ToDateExclusive)
                || (item.ScheduledStart < end && item.ScheduledEnd > item.ScheduledStart
                    && item.ScheduledEnd > start)
                || (item.ScheduledStart >= earliestDefaultBlockStart && item.ScheduledStart < end
                    && (item.ScheduledEnd == null || item.ScheduledEnd <= item.ScheduledStart)))
            .Where(item => database.Projects.Any(project => project.Id == item.ProjectId))
            .Where(item => item.FolderId == null || database.Folders.Any(folder => folder.Id == item.FolderId))
            .ToListAsync(cancellationToken);

        var entries = new List<CalendarEntry>();
        var types = await database.ItemTypes.AsNoTracking()
            .ToDictionaryAsync(type => type.Id, type => type.Name, cancellationToken);
        var priorities = await database.PriorityLevels.AsNoTracking()
            .ToDictionaryAsync(priority => priority.Id, priority => priority.Name, cancellationToken);

        foreach (var item in items)
        {
            AddEntries(entries, item, query, types, priorities);
        }

        return entries;
    }

    private static void AddEntries(List<CalendarEntry> entries, TodoItem item, CalendarQuery query,
        IReadOnlyDictionary<Guid, string> types, IReadOnlyDictionary<Guid, string> priorities)
    {
        var type = LookupName(types, item.ItemTypeId);
        var priority = LookupName(priorities, item.PriorityLevelId);

        if (item.DueDate is DateOnly dueDate && dueDate >= query.FromDate && dueDate < query.ToDateExclusive)
        {
            entries.Add(CreateEntry(item, CalendarEntryKind.Due, dueDate, item.DueTime, type, priority));
        }

        if (item.ScheduledStart is DateTime scheduledStart)
        {
            entries.Add(CreateEntry(item, CalendarEntryKind.Scheduled,
                DateOnly.FromDateTime(scheduledStart), TimeOnly.FromDateTime(scheduledStart), type, priority));
        }
    }

    private static string? LookupName(IReadOnlyDictionary<Guid, string> values, Guid? id)
    {
        return id is Guid key && values.TryGetValue(key, out var name) ? name : null;
    }

    private static CalendarEntry CreateEntry(TodoItem item, CalendarEntryKind kind, DateOnly date,
        TimeOnly? time, string? type, string? priority)
    {
        return new CalendarEntry(item.Id, item.ProjectId, item.FolderId, item.Title, kind,
            date, time, item.ScheduledStart, item.ScheduledEnd, item.CompletedAtUtc is not null,
            item.DueDate, item.DueTime, type, priority);
    }
}