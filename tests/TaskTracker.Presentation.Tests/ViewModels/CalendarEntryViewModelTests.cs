using TaskTracker.Core.Urgency;
using TaskTracker.Presentation.ViewModels;

using UrgencyLevel = TaskTracker.Core.Urgency.Urgency;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>Per-entry urgency, labels and tooltip.</summary>
public sealed class CalendarEntryViewModelTests
{
    private static readonly DateTime Now = new(2026, 11, 13, 12, 0, 0, DateTimeKind.Utc);

    private static readonly DateOnly Today = new(2026, 11, 13);

    [Theory]
    [InlineData(11, UrgencyLevel.Overdue, "Overdue", true)]
    [InlineData(13, UrgencyLevel.Imminent, "Imminent", false)]
    [InlineData(12 + 48, UrgencyLevel.Approaching, "Approaching", false)]
    [InlineData(12 + 24 * 6, UrgencyLevel.None, "", false)]
    public void Timed_due_entry_shows_its_urgency_as_a_label_and_not_by_colour_alone(
        int dueHourOffset, UrgencyLevel expected, string expectedLabel, bool expectedOverdue)
    {
        var due = Now.Date.AddHours(dueHourOffset);
        var entry = CreateViewModel(CalendarEntries.Due(DateOnly.FromDateTime(due), time: TimeOnly.FromDateTime(due)));

        entry.RefreshUrgency(Now, TimeZoneInfo.Utc);

        Assert.Equal(expected, entry.Urgency);
        Assert.Equal(expectedLabel, entry.UrgencyLabel);
        Assert.Equal(expected != UrgencyLevel.None, entry.HasUrgencyLabel);
        Assert.Equal(expectedOverdue, entry.IsOverdue);
    }

    [Fact]
    public void Entry_uses_the_thresholds_attached_to_it()
    {
        var narrow = new UrgencyThresholds(TimeSpan.FromHours(2), TimeSpan.FromHours(1));
        var due = CalendarEntries.Due(Today, time: new TimeOnly(18, 0), thresholds: narrow);
        var entry = CreateViewModel(due);

        entry.RefreshUrgency(Now, TimeZoneInfo.Utc);

        Assert.Equal(UrgencyLevel.None, entry.Urgency);
    }

    [Fact]
    public void Completed_entry_has_no_urgency_even_when_overdue()
    {
        var entry = CreateViewModel(CalendarEntries.Due(Today.AddDays(-3), isCompleted: true));

        entry.RefreshUrgency(Now, TimeZoneInfo.Utc);

        Assert.Equal(UrgencyLevel.None, entry.Urgency);
        Assert.Equal(string.Empty, entry.UrgencyLabel);
    }

    [Fact]
    public void Scheduled_entry_without_a_due_date_counts_down_to_its_start()
    {
        var start = new DateTime(2026, 11, 13, 11, 0, 0);
        var entry = CreateViewModel(CalendarEntries.Scheduled(start, start.AddHours(1)));

        entry.RefreshUrgency(Now, TimeZoneInfo.Utc);

        Assert.Equal(UrgencyLevel.Overdue, entry.Urgency);
    }

    [Fact]
    public void Urgency_is_evaluated_in_the_time_zone_passed_in()
    {
        var tokyo = TimeZoneInfo.CreateCustomTimeZone("Test+9", TimeSpan.FromHours(9), "Test+9", "Test+9");
        var due = CalendarEntries.Due(Today, time: new TimeOnly(20, 0));
        var entry = CreateViewModel(due);

        entry.RefreshUrgency(Now, tokyo);

        Assert.Equal(UrgencyLevel.Overdue, entry.Urgency);
    }

    [Fact]
    public void Changing_urgency_raises_property_changes_for_the_label_and_weight()
    {
        var entry = CreateViewModel(CalendarEntries.Due(Today.AddDays(-1)));
        var changed = new List<string?>();
        entry.PropertyChanged += (_, args) => changed.Add(args.PropertyName);

        entry.RefreshUrgency(Now, TimeZoneInfo.Utc);

        Assert.Contains(nameof(CalendarEntryViewModel.UrgencyLabel), changed);
        Assert.Contains(nameof(CalendarEntryViewModel.HasUrgencyLabel), changed);
        Assert.Contains(nameof(CalendarEntryViewModel.IsOverdue), changed);
    }

    [Fact]
    public void Labels_mark_completed_entries_and_month_labels_lead_with_the_start_time()
    {
        var done = CreateViewModel(CalendarEntries.Due(Today, "Done", isCompleted: true));
        var timed = CreateViewModel(CalendarEntries.Due(Today, "Timed", new TimeOnly(9, 5)));

        Assert.Equal("✓ Done", done.Label);
        Assert.Equal("✓ Done", done.MonthLabel);
        Assert.Equal(0.55, done.Opacity);
        Assert.Equal("Timed", timed.Label);
        Assert.StartsWith("09", timed.MonthLabel);
        Assert.EndsWith("05 Timed", timed.MonthLabel);
    }

    [Fact]
    public void Tooltip_names_type_and_priority_with_placeholders()
    {
        var full = CreateViewModel(CalendarEntries.Due(Today, itemType: "Task", priority: "High"));
        var bare = CreateViewModel(CalendarEntries.Due(Today));

        Assert.Equal("Task · High", full.Tooltip);
        Assert.Equal("No type · No priority", bare.Tooltip);
    }

    private static CalendarEntryViewModel CreateViewModel(TaskTracker.Core.Calendar.CalendarEntry entry)
    {
        var occurrence = CalendarLayout.Clip(entry, entry.Date);
        return Assert.IsType<CalendarEntryViewModel>(occurrence);
    }
}