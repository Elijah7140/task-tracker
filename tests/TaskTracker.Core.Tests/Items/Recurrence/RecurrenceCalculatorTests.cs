using TaskTracker.Core.Items.Recurrence;

namespace TaskTracker.Core.Tests.Items.Recurrence;

/// <summary>Calendar arithmetic for one floating recurrence step.</summary>
public sealed class RecurrenceCalculatorTests
{
    [Theory]
    [InlineData(1, 14)]
    [InlineData(3, 16)]
    public void Daily_adds_the_interval(int interval, int day)
    {
        var start = new DateOnly(2026, 11, 13);
        var rule = new RecurrenceRule(RecurrenceFrequency.Daily, interval);

        var next = RecurrenceCalculator.Next(rule, start, start);

        Assert.Equal(new DateOnly(2026, 11, day), next);
    }

    [Theory]
    [InlineData(23, 2, 26)]
    [InlineData(26, 1, 30)]
    [InlineData(26, 2, 7)]
    [InlineData(29, 2, 7)]
    public void Weekly_uses_remaining_days_then_wraps_across_sunday(int day, int interval, int expectedDay)
    {
        var start = new DateOnly(2026, 11, day);
        var rule = new RecurrenceRule(RecurrenceFrequency.Weekly, interval, RecurrenceWeekdays.Monday | RecurrenceWeekdays.Thursday);

        var next = RecurrenceCalculator.Next(rule, start, start);

        Assert.Equal(new DateOnly(2026, expectedDay == 7 ? 12 : 11, expectedDay), next);
    }

    [Fact]
    public void Weekly_due_anchor_advances_only_once_when_several_weeks_overdue()
    {
        var start = new DateOnly(2026, 11, 13);
        var rule = new RecurrenceRule(RecurrenceFrequency.Weekly, Weekdays: RecurrenceWeekdays.Friday);

        var next = RecurrenceCalculator.Next(rule, start, start.AddDays(21));

        Assert.Equal(start.AddDays(7), next);
    }

    [Theory]
    [InlineData(RecurrenceAnchor.DueDate, 6)]
    [InlineData(RecurrenceAnchor.CompletionDate, 12)]
    public void Anchor_selects_the_scheduled_date_or_local_completion_day(RecurrenceAnchor anchor, int day)
    {
        var due = new DateOnly(2026, 11, 4);
        var completed = new DateOnly(2026, 11, 10);
        var rule = new RecurrenceRule(RecurrenceFrequency.Daily, 2, Anchor: anchor);

        var next = RecurrenceCalculator.Next(rule, due, completed);

        Assert.Equal(new DateOnly(2026, 11, day), next);
    }

    [Theory]
    [InlineData(2026, 1, 31, 2, 28)]
    [InlineData(2028, 1, 31, 2, 29)]
    [InlineData(2026, 2, 31, 3, 31)]
    [InlineData(2026, 2, 0, 3, 31)]
    [InlineData(2026, 3, 31, 4, 30)]
    [InlineData(2026, 3, 15, 4, 15)]
    [InlineData(2026, 3, 0, 4, 30)]
    public void Monthly_uses_the_requested_day_with_month_end_clamping(int year, int month, int day, int nextMonth, int nextDay)
    {
        var start = new DateOnly(year, month, 28);
        var rule = new RecurrenceRule(RecurrenceFrequency.Monthly, MonthDay: day);

        var next = RecurrenceCalculator.Next(rule, start, start);

        Assert.Equal(new DateOnly(year, nextMonth, nextDay), next);
    }

    [Fact]
    public void Monthly_interval_can_cross_a_year_boundary()
    {
        var start = new DateOnly(2026, 11, 30);
        var rule = new RecurrenceRule(RecurrenceFrequency.Monthly, 3, MonthDay: 0);

        var next = RecurrenceCalculator.Next(rule, start, start);

        Assert.Equal(new DateOnly(2027, 2, 28), next);
    }

    [Theory]
    [InlineData(1, 2025, 28)]
    [InlineData(2, 2026, 28)]
    [InlineData(4, 2028, 29)]
    public void Yearly_february_29_clamps_only_in_non_leap_years(int interval, int year, int day)
    {
        var start = new DateOnly(2024, 2, 29);
        var rule = new RecurrenceRule(RecurrenceFrequency.Yearly, interval, MonthDay: 29, Month: 2);

        var next = RecurrenceCalculator.Next(rule, start, start);

        Assert.Equal(new DateOnly(year, 2, day), next);
    }

    [Theory]
    [InlineData(RecurrenceEndKind.Never, null, null, true)]
    [InlineData(RecurrenceEndKind.OnDate, 14, null, true)]
    [InlineData(RecurrenceEndKind.OnDate, 13, null, false)]
    [InlineData(RecurrenceEndKind.AfterCount, null, 2, true)]
    [InlineData(RecurrenceEndKind.AfterCount, null, 1, false)]
    public void End_date_is_inclusive_and_count_includes_the_current_occurrence(
        RecurrenceEndKind kind, int? endDay, int? remaining, bool continues)
    {
        var start = new DateOnly(2026, 11, 13);
        DateOnly? end = endDay is { } day ? new DateOnly(2026, 11, day) : null;
        var rule = new RecurrenceRule(RecurrenceFrequency.Daily, EndKind: kind, EndDate: end, Remaining: remaining);

        var next = RecurrenceCalculator.Next(rule, start, start);

        Assert.Equal(continues ? start.AddDays(1) : (DateOnly?)null, next);
    }

    [Theory]
    [InlineData(RecurrenceFrequency.Daily)]
    [InlineData(RecurrenceFrequency.Weekly)]
    [InlineData(RecurrenceFrequency.Monthly)]
    [InlineData(RecurrenceFrequency.Yearly)]
    public void An_unrepresentable_next_date_ends_the_rule(RecurrenceFrequency frequency)
    {
        var rule = frequency switch
        {
            RecurrenceFrequency.Weekly => new RecurrenceRule(frequency, int.MaxValue, RecurrenceWeekdays.Monday),
            RecurrenceFrequency.Monthly => new RecurrenceRule(frequency, int.MaxValue, MonthDay: 1),
            RecurrenceFrequency.Yearly => new RecurrenceRule(frequency, int.MaxValue, MonthDay: 1, Month: 1),
            _ => new RecurrenceRule(frequency, int.MaxValue)
        };

        var next = RecurrenceCalculator.Next(rule, DateOnly.MaxValue, DateOnly.MaxValue);

        Assert.Null(next);
    }
}