using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Undo;

namespace TaskTracker.Core.Calendar;

/// <summary>Reschedules items from the calendar, one unit of work per operation.</summary>
public sealed class CalendarRescheduleService(IUnitOfWorkFactory factory, TimeProvider clock, FieldWriteGate? writeGate = null)
    : ICalendarRescheduler
{
    private readonly FieldWriteGate gate = writeGate ?? FieldWriteGate.Shared;

    /// <inheritdoc />
    public async Task MoveDueAsync(Guid itemId, DateOnly date, TimeOnly? time,
        CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unit = factory.Begin();
        var item = await FindActiveItemAsync(unit, itemId, cancellationToken);
        item.SetDue(date, time, clock);
        await unit.SaveChangesAsync(UndoLabels.Reschedule(item.Title), cancellationToken);
    }

    /// <inheritdoc />
    public async Task MoveScheduleAsync(Guid itemId, DateTime newStart,
        CancellationToken cancellationToken = default)
    {
        if (newStart.Kind == DateTimeKind.Utc)
        {
            throw new DomainRuleException("Scheduled times must be floating local values.");
        }

        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unit = factory.Begin();
        var item = await FindActiveItemAsync(unit, itemId, cancellationToken);
        var newEnd = ShiftedEnd(item, newStart);
        item.SetSchedule(newStart, newEnd, clock);
        await unit.SaveChangesAsync(UndoLabels.Reschedule(item.Title), cancellationToken);
    }

    private static async Task<TodoItem> FindActiveItemAsync(IUnitOfWork unit, Guid itemId,
        CancellationToken cancellationToken)
    {
        return await unit.Items.FindAsync(itemId, cancellationToken)
            ?? throw new DomainRuleException("Item is missing or deleted.");
    }

    private static DateTime? ShiftedEnd(TodoItem item, DateTime newStart)
    {
        if (item.ScheduledStart is not DateTime oldStart)
        {
            throw new DomainRuleException("Item has no schedule to move.");
        }

        if (item.ScheduledEnd is not DateTime oldEnd)
        {
            return null;
        }

        var length = oldEnd - oldStart;

        if (newStart > DateTime.MaxValue - length)
        {
            throw new DomainRuleException("The new schedule is beyond the supported dates.");
        }

        return newStart + length;
    }
}