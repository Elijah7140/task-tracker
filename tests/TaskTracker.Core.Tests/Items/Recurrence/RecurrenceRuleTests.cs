using TaskTracker.Core.Items.Recurrence;

namespace TaskTracker.Core.Tests.Items.Recurrence;

/// <summary>Valid rule shapes and their plain-English descriptions.</summary>
public sealed class RecurrenceRuleTests
{
    public static TheoryData<RecurrenceRule, string> InvalidRules => new()
    {
        { default, "Frequency" },
        { new(RecurrenceFrequency.Daily, 0), "Interval" },
        { new(RecurrenceFrequency.Weekly), "Weekdays" },
        { new(RecurrenceFrequency.Weekly, Weekdays: (RecurrenceWeekdays)128), "Weekdays" },
        { new(RecurrenceFrequency.Daily, Weekdays: RecurrenceWeekdays.Monday), "Weekdays" },
        { new(RecurrenceFrequency.Monthly, MonthDay: 32), "MonthDay" },
        { new(RecurrenceFrequency.Yearly, MonthDay: 30, Month: 2), "MonthDay" },
        { new(RecurrenceFrequency.Yearly, MonthDay: 1, Month: 13), "Month" },
        { new(RecurrenceFrequency.Daily, Anchor: (RecurrenceAnchor)0), "Anchor" },
        { new(RecurrenceFrequency.Daily, EndKind: (RecurrenceEndKind)0), "EndKind" },
        { new(RecurrenceFrequency.Daily, EndKind: RecurrenceEndKind.AfterCount, Remaining: 0), "Remaining" },
        { new(RecurrenceFrequency.Daily, EndKind: RecurrenceEndKind.OnDate), "EndDate" }
    };

    [Theory]
    [MemberData(nameof(InvalidRules))]
    public void Validation_identifies_the_invalid_property(RecurrenceRule rule, string property)
    {
        var failure = rule.FindError();

        Assert.Equal(property, failure?.Property);
    }

    [Fact]
    public void Descriptions_present_weekdays_month_end_and_leap_day()
    {
        var weekly = new RecurrenceRule(RecurrenceFrequency.Weekly, 2, RecurrenceWeekdays.Monday | RecurrenceWeekdays.Thursday);
        var monthly = new RecurrenceRule(RecurrenceFrequency.Monthly, MonthDay: 0);
        var yearly = new RecurrenceRule(RecurrenceFrequency.Yearly, MonthDay: 29, Month: 2);

        Assert.Equal("Every 2 weeks on Mon, Thu", weekly.Describe());
        Assert.Equal("Monthly on the last day", monthly.Describe());
        Assert.Equal("Every year on 29 Feb", yearly.Describe());
    }
}