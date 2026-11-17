namespace TaskTracker.Core.Items.Recurrence;

/// <summary>Calculates one next occurrence using only floating calendar dates.</summary>
public static class RecurrenceCalculator
{
    /// <summary>Returns null when the rule is exhausted or the next date is outside the calendar.</summary>
    public static DateOnly? Next(RecurrenceRule rule, DateOnly scheduledDate, DateOnly completionDate)
    {
        if (rule.FindError() is { } error)
        {
            throw new ArgumentException(error.Message, nameof(rule));
        }

        if (rule.Remaining == 1)
        {
            return null;
        }

        var anchor = rule.Anchor == RecurrenceAnchor.DueDate ? scheduledDate : completionDate;
        var next = Advance(rule, anchor);
        return next > rule.EndDate ? null : next;
    }

    private static DateOnly? Advance(RecurrenceRule rule, DateOnly anchor)
    {
        try
        {
            return rule.Frequency switch
            {
                RecurrenceFrequency.Daily => anchor.AddDays(rule.Interval),
                RecurrenceFrequency.Weekly => NextWeekday(anchor, rule.Interval, rule.Weekdays!.Value),
                RecurrenceFrequency.Monthly => InMonth(anchor.AddMonths(rule.Interval), rule.MonthDay!.Value),
                RecurrenceFrequency.Yearly => InMonth(
                    new DateOnly(anchor.Year, rule.Month!.Value, 1).AddYears(rule.Interval), rule.MonthDay!.Value),
                _ => throw new InvalidOperationException("Unknown repeat frequency.")
            };
        }
        catch (ArgumentOutOfRangeException)
        {
            return null;
        }
    }

    private static DateOnly? NextWeekday(DateOnly anchor, int interval, RecurrenceWeekdays days)
    {
        var anchorIndex = ((int)anchor.DayOfWeek + 6) % 7;
        for (var index = anchorIndex + 1; index < 7; index++)
        {
            if (Includes(days, index))
            {
                return anchor.AddDays(index - anchorIndex);
            }
        }

        var firstDay = Enumerable.Range(0, 7).First(index => Includes(days, index));
        var offset = 7L * interval + firstDay - anchorIndex;
        return offset > DateOnly.MaxValue.DayNumber - anchor.DayNumber ? null : anchor.AddDays((int)offset);
    }

    private static bool Includes(RecurrenceWeekdays days, int index)
    {
        return (days & (RecurrenceWeekdays)(1 << index)) != 0;
    }

    private static DateOnly InMonth(DateOnly month, int day)
    {
        var lastDay = DateTime.DaysInMonth(month.Year, month.Month);
        return new DateOnly(month.Year, month.Month, day == 0 ? lastDay : Math.Min(day, lastDay));
    }
}