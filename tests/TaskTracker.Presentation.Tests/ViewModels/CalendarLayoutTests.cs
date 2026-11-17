using System.Globalization;

using TaskTracker.Core.Calendar;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>Calendar date placement, ordering and timed entry geometry.</summary>
public sealed class CalendarLayoutTests
{
    private static readonly CultureInfo English = CultureInfo.GetCultureInfo("en-US");

    private static readonly DateOnly Monday = new(2026, 11, 16);

    [Theory]
    [InlineData("en-US", 15)]
    [InlineData("de-DE", 16)]
    public void Week_start_uses_the_selected_culture(string cultureName, int expectedDay)
    {
        var culture = CultureInfo.GetCultureInfo(cultureName);
        var date = new DateOnly(2026, 11, 18);

        var start = CalendarLayout.StartOfWeek(date, culture.DateTimeFormat.FirstDayOfWeek);

        Assert.Equal(expectedDay, start.Day);
    }

    [Theory]
    [InlineData("en-US", "Nov 16 – 22, 2026")]
    [InlineData("de-DE", "16. – 22. Nov 2026")]
    public void Week_title_uses_culture_order(string cultureName, string expected)
    {
        var culture = CultureInfo.GetCultureInfo(cultureName);

        var title = CalendarLayout.WeekTitle(Monday, culture);

        Assert.Equal(expected, title);
    }

    [Fact]
    public void Week_title_names_both_months_when_the_week_spans_two()
    {
        var title = CalendarLayout.WeekTitle(new DateOnly(2026, 11, 29), English);

        Assert.Equal("Nov 29 – Dec 5, 2026", title);
    }

    [Fact]
    public void Week_title_names_both_years_when_the_week_spans_new_year()
    {
        var title = CalendarLayout.WeekTitle(new DateOnly(2026, 12, 28), English);

        Assert.Equal("Dec 28, 2026 – Jan 3, 2027", title);
    }

    [Fact]
    public void Build_days_marks_days_outside_the_month_and_today()
    {
        var days = CalendarLayout.BuildDays(new DateOnly(2026, 11, 1), 42,
            new DateOnly(2026, 11, 13), new DateOnly(2026, 11, 13), [], English);

        Assert.Equal(42, days.Count);
        Assert.Equal(30, days.Count(day => !day.IsOutsideMonth));
        Assert.All(days.Where(day => day.IsOutsideMonth), day => Assert.Equal(0.55, day.Opacity));
        Assert.Equal(new DateOnly(2026, 11, 13), Assert.Single(days, day => day.IsToday).Date);
    }

    [Fact]
    public void Month_cell_lists_three_entries_and_counts_the_rest()
    {
        var date = new DateOnly(2026, 11, 13);
        var entries = Enumerable.Range(1, 5).Select(number => CalendarEntries.Due(date, $"Item {number}")).ToArray();

        var day = BuildDay(date, entries);

        Assert.Equal(3, day.VisibleEntries.Count);
        Assert.Equal(2, day.MoreCount);
        Assert.True(day.HasMore);
        Assert.Equal("+2 more", day.MoreLabel);
    }

    [Fact]
    public void Month_cell_with_exactly_three_entries_has_no_more_link()
    {
        var date = new DateOnly(2026, 11, 13);
        var entries = Enumerable.Range(1, 3).Select(number => CalendarEntries.Due(date, $"Item {number}")).ToArray();

        var day = BuildDay(date, entries);

        Assert.Equal(3, day.VisibleEntries.Count);
        Assert.False(day.HasMore);
    }

    [Fact]
    public void All_day_entries_come_before_timed_entries_then_timed_follow_start_order()
    {
        var date = Monday;
        var entries = new[]
        {
            CalendarEntries.Scheduled(date.ToDateTime(new TimeOnly(15, 0)), null, "Afternoon block"),
            CalendarEntries.Due(date, "Timed due", new TimeOnly(9, 0)),
            CalendarEntries.Due(date, "All day"),
            CalendarEntries.Scheduled(date.ToDateTime(new TimeOnly(8, 0)), null, "Early block")
        };

        var day = BuildDay(date, entries);

        var titles = day.Entries.Select(entry => entry.Entry.Title).ToArray();
        Assert.Equal(["All day", "Early block", "Timed due", "Afternoon block"], titles);
        Assert.Equal(["All day"], day.AllDayEntries.Select(entry => entry.Entry.Title));
        Assert.Equal(3, day.TimedEntries.Count);
    }

    [Fact]
    public void Entries_with_the_same_start_are_ordered_by_title_ignoring_case()
    {
        var entries = new[]
        {
            CalendarEntries.Due(Monday, "banana"),
            CalendarEntries.Due(Monday, "Cherry"),
            CalendarEntries.Due(Monday, "Apple")
        };

        var day = BuildDay(Monday, entries);

        Assert.Equal(["Apple", "banana", "Cherry"], day.Entries.Select(entry => entry.Entry.Title));
    }

    [Fact]
    public void Entries_with_the_same_start_and_title_are_ordered_by_item_id_whatever_the_input_order()
    {
        var low = new Guid("00000000-0000-0000-0000-000000000001");
        var high = new Guid("00000000-0000-0000-0000-000000000002");
        var lowEntry = CalendarEntries.Due(Monday, "Same", itemId: low);
        var highEntry = CalendarEntries.Due(Monday, "Same", itemId: high);

        var forward = BuildDay(Monday, [lowEntry, highEntry]);
        var backward = BuildDay(Monday, [highEntry, lowEntry]);

        Assert.Equal([low, high], forward.Entries.Select(entry => entry.Entry.ItemId));
        Assert.Equal([low, high], backward.Entries.Select(entry => entry.Entry.ItemId));
    }

    [Fact]
    public void Schedule_crossing_midnight_is_clipped_to_each_day()
    {
        var entry = CalendarEntries.Scheduled(new DateTime(2026, 11, 16, 23, 0, 0),
            new DateTime(2026, 11, 17, 1, 0, 0));

        var first = CalendarLayout.Clip(entry, new DateOnly(2026, 11, 16));
        var second = CalendarLayout.Clip(entry, new DateOnly(2026, 11, 17));

        Assert.NotNull(first);
        Assert.NotNull(second);
        Assert.Equal(new TimeOnly(23, 0), first.Start);
        Assert.Equal(TimeOnly.MinValue, second.Start);
        Assert.Equal(new TimeOnly(1, 0), second.End);
    }

    [Fact]
    public void Block_ending_exactly_at_midnight_does_not_appear_on_the_next_day()
    {
        var entry = CalendarEntries.Scheduled(new DateTime(2026, 11, 16, 22, 0, 0),
            new DateTime(2026, 11, 17, 0, 0, 0));

        var first = CalendarLayout.Clip(entry, new DateOnly(2026, 11, 16));
        var second = CalendarLayout.Clip(entry, new DateOnly(2026, 11, 17));

        Assert.NotNull(first);
        Assert.Equal(TimeOnly.MaxValue, first.End);
        Assert.Equal(2 * CalendarMetrics.HourHeight, first.Height, 1);
        Assert.Null(second);
    }

    [Fact]
    public void Zero_length_schedule_at_midnight_is_a_thirty_minute_block()
    {
        var start = new DateTime(2026, 11, 16, 0, 0, 0);
        var entry = CalendarEntries.Scheduled(start, start);

        var occurrence = CalendarLayout.Clip(entry, new DateOnly(2026, 11, 16));

        Assert.NotNull(occurrence);
        Assert.Equal(TimeOnly.MinValue, occurrence.Start);
        Assert.Equal(new TimeOnly(0, 30), occurrence.End);
        Assert.Equal(30, occurrence.DurationMinutes);
    }

    [Fact]
    public void Zero_length_schedule_just_before_midnight_continues_on_the_next_day()
    {
        var start = new DateTime(2026, 11, 16, 23, 45, 0);
        var entry = CalendarEntries.Scheduled(start, start);

        var first = CalendarLayout.Clip(entry, new DateOnly(2026, 11, 16));
        var second = CalendarLayout.Clip(entry, new DateOnly(2026, 11, 17));

        Assert.NotNull(first);
        Assert.NotNull(second);
        Assert.Equal(new TimeOnly(0, 15), second.End);
    }

    [Fact]
    public void Block_on_a_daylight_saving_day_keeps_its_floating_length()
    {
        var entry = CalendarEntries.Scheduled(new DateTime(2026, 3, 8, 1, 0, 0), new DateTime(2026, 3, 8, 4, 0, 0));

        var occurrence = CalendarLayout.Clip(entry, new DateOnly(2026, 3, 8));

        Assert.NotNull(occurrence);
        Assert.Equal(180, occurrence.DurationMinutes);
        Assert.Equal(3 * CalendarMetrics.HourHeight, occurrence.Height, 1);
        Assert.Equal(CalendarMetrics.HourHeight, occurrence.Top, 1);
    }

    [Fact]
    public void Short_blocks_and_markers_are_never_shorter_than_the_minimum()
    {
        var shortBlock = CalendarLayout.Clip(
            CalendarEntries.Scheduled(new DateTime(2026, 11, 16, 9, 0, 0), new DateTime(2026, 11, 16, 9, 10, 0)),
            Monday);
        var marker = CalendarLayout.Clip(CalendarEntries.Due(Monday, time: new TimeOnly(9, 0)), Monday);

        Assert.NotNull(shortBlock);
        Assert.NotNull(marker);
        Assert.Equal(CalendarMetrics.MinEntryHeight, shortBlock.Height);
        Assert.Equal(CalendarMetrics.MinEntryHeight, marker.Height);
    }

    [Fact]
    public void Overlapping_blocks_split_the_day_width()
    {
        var start = new DateTime(2026, 11, 16, 9, 0, 0);
        var entries = new[]
        {
            CalendarEntries.Scheduled(start, start.AddHours(2)),
            CalendarEntries.Scheduled(start.AddMinutes(30), start.AddHours(1))
        };

        var day = BuildDay(Monday, entries);

        Assert.All(day.Entries, entry => Assert.Equal(0.5, entry.WidthFraction));
        Assert.Equal(0, day.Entries[0].LeftFraction);
        Assert.Equal(0.5, day.Entries[1].LeftFraction);
    }

    [Fact]
    public void Overlap_groups_are_transitive_through_a_middle_block()
    {
        var entries = new[]
        {
            CalendarEntries.Scheduled(Monday.ToDateTime(new TimeOnly(9, 0)), Monday.ToDateTime(new TimeOnly(10, 0)), "First"),
            CalendarEntries.Scheduled(Monday.ToDateTime(new TimeOnly(9, 30)), Monday.ToDateTime(new TimeOnly(11, 0)), "Middle"),
            CalendarEntries.Scheduled(Monday.ToDateTime(new TimeOnly(10, 30)), Monday.ToDateTime(new TimeOnly(11, 30)), "Last")
        };

        var day = BuildDay(Monday, entries);

        Assert.All(day.Entries, entry => Assert.Equal(0.5, entry.WidthFraction));
        Assert.Equal(0, Entry(day, "First").LeftFraction);
        Assert.Equal(0.5, Entry(day, "Middle").LeftFraction);
        Assert.Equal(0, Entry(day, "Last").LeftFraction);
    }

    [Fact]
    public void Blocks_that_only_touch_do_not_share_width()
    {
        var entries = new[]
        {
            CalendarEntries.Scheduled(Monday.ToDateTime(new TimeOnly(9, 0)), Monday.ToDateTime(new TimeOnly(10, 0)), "Before"),
            CalendarEntries.Scheduled(Monday.ToDateTime(new TimeOnly(10, 0)), Monday.ToDateTime(new TimeOnly(11, 0)), "After")
        };

        var day = BuildDay(Monday, entries);

        Assert.All(day.Entries, entry => Assert.Equal(1.0, entry.WidthFraction));
    }

    [Fact]
    public void Blocks_with_identical_starts_split_the_width_evenly()
    {
        var start = Monday.ToDateTime(new TimeOnly(9, 0));
        var entries = new[]
        {
            CalendarEntries.Scheduled(start, start.AddHours(1), "A"),
            CalendarEntries.Scheduled(start, start.AddHours(1), "B"),
            CalendarEntries.Scheduled(start, start.AddHours(1), "C")
        };

        var day = BuildDay(Monday, entries);

        Assert.All(day.Entries, entry => Assert.Equal(1.0 / 3, entry.WidthFraction, 5));
        Assert.Equal([0.0, 1.0 / 3, 2.0 / 3], day.Entries.Select(entry => entry.LeftFraction).ToArray());
    }

    [Fact]
    public void Timed_due_marker_overlapping_a_block_shares_the_column()
    {
        var entries = new[]
        {
            CalendarEntries.Scheduled(Monday.ToDateTime(new TimeOnly(9, 0)), Monday.ToDateTime(new TimeOnly(11, 0)), "Block"),
            CalendarEntries.Due(Monday, "Marker", new TimeOnly(9, 30))
        };

        var day = BuildDay(Monday, entries);

        Assert.All(day.Entries, entry => Assert.Equal(0.5, entry.WidthFraction));
    }

    private static CalendarDayViewModel BuildDay(DateOnly date, IReadOnlyList<CalendarEntry> entries)
    {
        var days = CalendarLayout.BuildDays(date, 1, date, date, entries, English);
        return Assert.Single(days);
    }

    private static CalendarEntryViewModel Entry(CalendarDayViewModel day, string title)
    {
        return Assert.Single(day.Entries, entry => entry.Entry.Title == title);
    }
}