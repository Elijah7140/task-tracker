namespace TaskTracker.Core.Items.Recurrence;

/// <summary>Moves floating dates by the same offset while preserving their times.</summary>
internal static class OccurrenceDates
{
    public static void Move(TodoItem item, DateOnly next, TimeProvider clock)
    {
        Shift(item, next.DayNumber - item.RecurrenceDate!.Value.DayNumber, clock);
    }

    public static void Shift(TodoItem item, int days, TimeProvider clock)
    {
        try
        {
            item.SetSchedule(item.ScheduledStart?.AddDays(days), item.ScheduledEnd?.AddDays(days), clock);
            item.SetDue(item.DueDate?.AddDays(days), item.DueTime, clock);
        }
        catch (ArgumentOutOfRangeException)
        {
            throw new DomainRuleException("The next repeat would move a date outside the supported calendar.");
        }
    }

    public static RecurrenceRule AdvanceRule(RecurrenceRule rule)
    {
        return rule with { Remaining = rule.Remaining - 1 };
    }
}