using TaskTracker.Core;
using TaskTracker.Core.Items;
using TaskTracker.Core.Items.Recurrence;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>Draft edits, validation and preservation of clamped yearly patterns.</summary>
public sealed class RecurrenceDraftViewModelTests
{
    [Fact]
    public void A_rule_without_a_date_is_dirty_and_cannot_be_saved()
    {
        var item = CreateItem();
        var editor = new ItemEditorViewModel(item);

        editor.Repeat.FrequencyIndex = (int)RecurrenceFrequency.Daily;

        Assert.True(editor.IsDirty(item));
        Assert.Contains("needs a due date", editor.Repeat.Error);
        Assert.Throws<DomainRuleException>(editor.ToEdit);

        editor.DueDateText = "2026-11-16";

        Assert.False(editor.Repeat.HasError);
        Assert.Equal("Daily", editor.Repeat.Summary);
        Assert.Equal(RecurrenceFrequency.Daily, editor.ToEdit().Recurrence?.Frequency);
    }

    [Fact]
    public void Weekday_and_interval_changes_update_the_summary_and_save_values()
    {
        var item = CreateItem();
        item.SetDue(new DateOnly(2026, 11, 16), null, TimeProvider.System);
        var editor = new ItemEditorViewModel(item);
        editor.Repeat.FrequencyIndex = (int)RecurrenceFrequency.Weekly;

        editor.Repeat.IntervalText = "2";
        editor.Repeat.Weekdays.Single(day => day.Day == RecurrenceWeekdays.Thursday).IsSelected = true;

        Assert.Equal("Every 2 weeks on Mon, Thu", editor.Repeat.Summary);
        Assert.Equal(RecurrenceWeekdays.Monday | RecurrenceWeekdays.Thursday, editor.ToEdit().Recurrence?.Weekdays);
    }

    [Fact]
    public void A_saved_february_29_pattern_survives_edits_to_a_clamped_occurrence()
    {
        var item = CreateItem();
        item.SetDue(new DateOnly(2026, 2, 28), null, TimeProvider.System);
        item.SetRecurrence(new RecurrenceRule(RecurrenceFrequency.Yearly, MonthDay: 29, Month: 2), TimeProvider.System);
        var editor = new ItemEditorViewModel(item);

        editor.Title = "Changed title";

        Assert.Equal("Every year on 29 Feb", editor.Repeat.Summary);
        Assert.Equal(item.Recurrence, editor.ToEdit().Recurrence);

        editor.DueDateText = "2026-03-01";

        Assert.Equal("Every year on 1 Mar", editor.Repeat.Summary);
    }

    [Theory]
    [InlineData("0")]
    [InlineData("-1")]
    [InlineData("32")]
    [InlineData("")]
    public void The_monthly_day_must_be_between_one_and_thirty_one_unless_last_day_is_selected(string text)
    {
        var item = CreateItem();
        var draft = new RecurrenceDraftViewModel(item, () => new DateOnly(2026, 11, 16))
        {
            FrequencyIndex = (int)RecurrenceFrequency.Monthly,
            MonthDayText = text
        };

        Assert.Equal("Enter a day of the month from 1 to 31.", draft.Error);
        Assert.Null(draft.Summary);
        Assert.Throws<DomainRuleException>(() => draft.ToRule());

        draft.UseLastDay = true;

        Assert.Equal(0, draft.ToRule()?.MonthDay);
        Assert.Equal("Monthly on the last day", draft.Summary);

        draft.UseLastDay = false;
        draft.MonthDayText = "31";

        Assert.Equal(31, draft.ToRule()?.MonthDay);
    }

    private static TodoItem CreateItem()
    {
        return TodoItem.Create(Guid.CreateVersion7(), null, null, "Task", TimeProvider.System);
    }
}