using System.Linq.Expressions;

using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Calendar;
using TaskTracker.Core.Items;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>Queries active items and their calendar fields in SQLite.</summary>
public sealed class EfCalendarRepository(TaskTrackerDbContext database) : ICalendarRepository
{
    public async Task<IReadOnlyList<CalendarEntry>> LoadAsync(CalendarQuery query, CancellationToken cancellationToken)
    {
        var items = await LoadCandidateItemsAsync(query, cancellationToken);
        var types = await LoadTypeNamesAsync(cancellationToken);
        var priorities = await LoadPriorityNamesAsync(cancellationToken);
        var entries = new List<CalendarEntry>();

        foreach (var item in items)
        {
            AddEntries(entries, item, query, types, priorities);
        }

        return entries;
    }

    private async Task<List<TodoItem>> LoadCandidateItemsAsync(CalendarQuery query, CancellationToken cancellationToken)
    {
        var candidates = database.TodoItems.AsNoTracking()
            .Where(item => query.ProjectId == null || item.ProjectId == query.ProjectId)
            .Where(item => query.IncludeCompleted || item.CompletedAtUtc == null);
        candidates = WhereInsideActiveProjectAndFolder(candidates);
        candidates = candidates.Where(CalendarFieldsTouchRange(query));

        return await candidates.ToListAsync(cancellationToken);
    }

    private IQueryable<TodoItem> WhereInsideActiveProjectAndFolder(IQueryable<TodoItem> items)
    {
        return items
            .Where(item => database.Projects.Any(project => project.Id == item.ProjectId))
            .Where(item => item.FolderId == null || database.Folders.Any(folder => folder.Id == item.FolderId));
    }

    /// <summary>
    /// A coarse database filter: the due date is in range, or a schedule overlaps it. The
    /// entries are then checked one by one, because one item can match through only one field.
    /// </summary>
    private static Expression<Func<TodoItem, bool>> CalendarFieldsTouchRange(CalendarQuery query)
    {
        var start = query.FromDate.ToDateTime(TimeOnly.MinValue);
        var end = query.ToDateExclusive.ToDateTime(TimeOnly.MinValue);
        var earliestDefaultBlockStart = start - CalendarEntry.DefaultBlockLength;

        return item => (item.DueDate >= query.FromDate && item.DueDate < query.ToDateExclusive)
            || (item.ScheduledStart < end && item.ScheduledEnd > item.ScheduledStart
                && item.ScheduledEnd > start)
            || (item.ScheduledStart >= earliestDefaultBlockStart && item.ScheduledStart < end
                && (item.ScheduledEnd == null || item.ScheduledEnd <= item.ScheduledStart));
    }

    private async Task<Dictionary<Guid, string>> LoadTypeNamesAsync(CancellationToken cancellationToken)
    {
        return await database.ItemTypes.AsNoTracking()
            .ToDictionaryAsync(type => type.Id, type => type.Name, cancellationToken);
    }

    private async Task<Dictionary<Guid, string>> LoadPriorityNamesAsync(CancellationToken cancellationToken)
    {
        return await database.PriorityLevels.AsNoTracking()
            .ToDictionaryAsync(priority => priority.Id, priority => priority.Name, cancellationToken);
    }

    private static void AddEntries(List<CalendarEntry> entries, TodoItem item, CalendarQuery query,
        IReadOnlyDictionary<Guid, string> types, IReadOnlyDictionary<Guid, string> priorities)
    {
        var type = LookupName(types, item.ItemTypeId);
        var priority = LookupName(priorities, item.PriorityLevelId);

        if (item.DueDate is DateOnly dueDate && DueDateIsInRange(dueDate, query))
        {
            entries.Add(CreateEntry(item, CalendarEntryKind.Due, dueDate, item.DueTime, type, priority));
        }

        if (item.ScheduledStart is DateTime scheduledStart && ScheduleOverlapsRange(item, scheduledStart, query))
        {
            entries.Add(CreateEntry(item, CalendarEntryKind.Scheduled,
                DateOnly.FromDateTime(scheduledStart), TimeOnly.FromDateTime(scheduledStart), type, priority));
        }
    }

    private static bool DueDateIsInRange(DateOnly dueDate, CalendarQuery query)
    {
        return dueDate >= query.FromDate && dueDate < query.ToDateExclusive;
    }

    private static bool ScheduleOverlapsRange(TodoItem item, DateTime scheduledStart, CalendarQuery query)
    {
        var rangeStart = query.FromDate.ToDateTime(TimeOnly.MinValue);
        var rangeEnd = query.ToDateExclusive.ToDateTime(TimeOnly.MinValue);
        var scheduledEnd = item.ScheduledEnd is DateTime end && end > scheduledStart
            ? end
            : scheduledStart + CalendarEntry.DefaultBlockLength;

        return scheduledStart < rangeEnd && scheduledEnd > rangeStart;
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