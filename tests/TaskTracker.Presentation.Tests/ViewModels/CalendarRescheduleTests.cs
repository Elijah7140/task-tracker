using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>What dropping or nudging each kind of calendar entry changes, as pure planning rules.</summary>
public sealed class CalendarRescheduleTests
{
    private static readonly DateOnly TheThirteenth = new(2026, 11, 13);

    private static readonly DateOnly TheFifteenth = new(2026, 11, 15);

    [Fact]
    public void Dropping_a_timed_due_entry_on_a_month_cell_changes_the_date_and_keeps_the_time()
    {
        var entry = DueOccurrence(time: new TimeOnly(10, 0));

        var move = CalendarReschedule.Plan(entry, Target(CalendarDropZone.MonthCell, TheFifteenth));

        Assert.Equal(CalendarMoveKind.Due, move.Kind);
        Assert.Equal(TheFifteenth, move.Date);
        Assert.Equal(new TimeOnly(10, 0), move.Time);
    }

    [Fact]
    public void Dropping_an_all_day_due_entry_on_a_month_cell_keeps_it_all_day()
    {
        var entry = DueOccurrence();

        var move = CalendarReschedule.Plan(entry, Target(CalendarDropZone.MonthCell, TheFifteenth));

        Assert.Equal(CalendarMove.ForDue(TheFifteenth, null), move);
    }

    [Fact]
    public void Dropping_an_all_day_due_entry_on_another_all_day_cell_changes_only_the_date()
    {
        var entry = DueOccurrence();

        var move = CalendarReschedule.Plan(entry, Target(CalendarDropZone.AllDayRow, TheFifteenth));

        Assert.Equal(CalendarMove.ForDue(TheFifteenth, null), move);
    }

    [Fact]
    public void Dropping_an_all_day_due_entry_in_the_time_grid_makes_it_timed()
    {
        var entry = DueOccurrence();

        var move = CalendarReschedule.Plan(entry, Target(CalendarDropZone.TimeGrid, TheFifteenth, new TimeOnly(9, 45)));

        Assert.Equal(CalendarMove.ForDue(TheFifteenth, new TimeOnly(9, 45)), move);
    }

    [Fact]
    public void Dropping_a_timed_due_entry_in_the_time_grid_changes_date_and_time()
    {
        var entry = DueOccurrence(time: new TimeOnly(10, 0));

        var move = CalendarReschedule.Plan(entry, Target(CalendarDropZone.TimeGrid, TheFifteenth, new TimeOnly(16, 30)));

        Assert.Equal(CalendarMove.ForDue(TheFifteenth, new TimeOnly(16, 30)), move);
    }

    [Fact]
    public void Dropping_a_timed_due_entry_on_the_all_day_row_clears_its_time()
    {
        var entry = DueOccurrence(time: new TimeOnly(10, 0));

        var move = CalendarReschedule.Plan(entry, Target(CalendarDropZone.AllDayRow, TheThirteenth));

        Assert.Equal(CalendarMove.ForDue(TheThirteenth, null), move);
    }

    [Theory]
    [InlineData(CalendarDropZone.MonthCell)]
    [InlineData(CalendarDropZone.AllDayRow)]
    public void Dropping_an_all_day_due_entry_on_its_own_day_is_a_no_op(CalendarDropZone zone)
    {
        var entry = DueOccurrence();

        var move = CalendarReschedule.Plan(entry, Target(zone, TheThirteenth));

        Assert.True(move.IsNone);
    }

    [Fact]
    public void Dropping_a_timed_due_entry_on_its_own_day_and_time_is_a_no_op()
    {
        var entry = DueOccurrence(time: new TimeOnly(10, 0));

        var inGrid = CalendarReschedule.Plan(entry, Target(CalendarDropZone.TimeGrid, TheThirteenth, new TimeOnly(10, 0)));
        var onMonthCell = CalendarReschedule.Plan(entry, Target(CalendarDropZone.MonthCell, TheThirteenth));

        Assert.True(inGrid.IsNone);
        Assert.True(onMonthCell.IsNone);
    }

    [Fact]
    public void Dropping_a_schedule_on_a_month_cell_moves_the_start_by_whole_days_and_keeps_the_time()
    {
        var entry = ScheduleOccurrence(At(13, 9, 30), At(13, 11, 0));

        var move = CalendarReschedule.Plan(entry, Target(CalendarDropZone.MonthCell, TheFifteenth));

        Assert.Equal(CalendarMove.ForSchedule(At(15, 9, 30)), move);
    }

    [Fact]
    public void Dropping_a_schedule_in_the_time_grid_starts_it_at_the_dropped_time()
    {
        var entry = ScheduleOccurrence(At(13, 9, 30), At(13, 11, 0));

        var move = CalendarReschedule.Plan(entry, Target(CalendarDropZone.TimeGrid, TheFifteenth, new TimeOnly(14, 15)));

        Assert.Equal(CalendarMove.ForSchedule(At(15, 14, 15)), move);
    }

    [Fact]
    public void Dropping_a_schedule_without_an_end_moves_it_the_same_way()
    {
        var entry = ScheduleOccurrence(At(13, 9, 0), null);

        var move = CalendarReschedule.Plan(entry, Target(CalendarDropZone.TimeGrid, TheThirteenth, new TimeOnly(9, 15)));

        Assert.Equal(CalendarMove.ForSchedule(At(13, 9, 15)), move);
    }

    [Fact]
    public void Dropping_a_schedule_on_the_all_day_row_is_ignored()
    {
        var entry = ScheduleOccurrence(At(13, 9, 0), At(13, 10, 0));

        var move = CalendarReschedule.Plan(entry, Target(CalendarDropZone.AllDayRow, TheFifteenth));

        Assert.False(CalendarReschedule.Accepts(entry, CalendarDropZone.AllDayRow));
        Assert.True(move.IsNone);
    }

    [Fact]
    public void Dropping_a_schedule_on_its_own_slot_is_a_no_op()
    {
        var entry = ScheduleOccurrence(At(13, 9, 0), At(13, 10, 0));

        var inGrid = CalendarReschedule.Plan(entry, Target(CalendarDropZone.TimeGrid, TheThirteenth, new TimeOnly(9, 0)));
        var onMonthCell = CalendarReschedule.Plan(entry, Target(CalendarDropZone.MonthCell, TheThirteenth));

        Assert.True(inGrid.IsNone);
        Assert.True(onMonthCell.IsNone);
    }

    [Fact]
    public void Dragging_the_second_day_of_a_block_that_crosses_midnight_shifts_the_whole_schedule()
    {
        var schedule = CalendarEntries.Scheduled(At(13, 22, 0), At(14, 2, 0));
        var secondDay = CalendarLayout.Clip(schedule, TheThirteenth.AddDays(1))!;

        var move = CalendarReschedule.Plan(secondDay,
            Target(CalendarDropZone.TimeGrid, TheFifteenth, new TimeOnly(1, 0)));

        Assert.Equal(CalendarMove.ForSchedule(At(14, 23, 0)), move);
    }

    [Fact]
    public void Dragging_a_schedule_between_month_cells_from_its_second_day_shifts_by_the_day_difference()
    {
        var schedule = CalendarEntries.Scheduled(At(13, 22, 0), At(14, 2, 0));
        var secondDay = CalendarLayout.Clip(schedule, TheThirteenth.AddDays(1))!;

        var move = CalendarReschedule.Plan(secondDay, Target(CalendarDropZone.MonthCell, TheFifteenth));

        Assert.Equal(CalendarMove.ForSchedule(At(14, 22, 0)), move);
    }

    [Fact]
    public void Day_steps_move_all_day_and_timed_entries_by_one_day()
    {
        var allDay = DueOccurrence();
        var timed = DueOccurrence(time: new TimeOnly(10, 0));

        var allDayTarget = CalendarReschedule.StepTarget(allDay, 1, 0);
        var timedTarget = CalendarReschedule.StepTarget(timed, -1, 0);

        Assert.Equal(new CalendarDropTarget(CalendarDropZone.AllDayRow, TheThirteenth.AddDays(1), null), allDayTarget);
        Assert.Equal(new CalendarDropTarget(CalendarDropZone.TimeGrid, TheThirteenth.AddDays(-1), new TimeOnly(10, 0)),
            timedTarget);
    }

    [Fact]
    public void Minute_steps_are_ignored_for_all_day_entries()
    {
        var allDay = DueOccurrence();

        Assert.Null(CalendarReschedule.StepTarget(allDay, 0, 15));
        Assert.Null(CalendarReschedule.StepTarget(allDay, 0, -15));
    }

    [Fact]
    public void Minute_steps_move_timed_entries_by_a_quarter_hour()
    {
        var timed = DueOccurrence(time: new TimeOnly(10, 0));
        var scheduled = ScheduleOccurrence(At(13, 9, 0), At(13, 10, 0));

        var dueLater = CalendarReschedule.StepTarget(timed, 0, 15);
        var scheduleEarlier = CalendarReschedule.StepTarget(scheduled, 0, -15);

        Assert.Equal(new TimeOnly(10, 15), dueLater?.Time);
        Assert.Equal(new TimeOnly(8, 45), scheduleEarlier?.Time);
    }

    [Fact]
    public void A_timed_entry_stops_at_midnight_instead_of_crossing_it()
    {
        var atMidnight = DueOccurrence(time: new TimeOnly(0, 0));
        var nearMidnight = DueOccurrence(time: new TimeOnly(0, 10));
        var lateEvening = DueOccurrence(time: new TimeOnly(23, 45));
        var afterLastSlot = DueOccurrence(time: new TimeOnly(23, 59));

        Assert.Equal(TimeOnly.MinValue, CalendarReschedule.StepTarget(atMidnight, 0, -15)?.Time);
        Assert.Equal(TimeOnly.MinValue, CalendarReschedule.StepTarget(nearMidnight, 0, -15)?.Time);
        Assert.Equal(new TimeOnly(23, 45), CalendarReschedule.StepTarget(lateEvening, 0, 15)?.Time);
        Assert.Equal(new TimeOnly(23, 59), CalendarReschedule.StepTarget(afterLastSlot, 0, 15)?.Time);
    }

    [Fact]
    public void Nudging_a_timed_entry_against_the_edge_of_the_day_changes_nothing()
    {
        var atMidnight = DueOccurrence(time: new TimeOnly(0, 0));
        var target = CalendarReschedule.StepTarget(atMidnight, 0, -15)!.Value;

        var move = CalendarReschedule.Plan(atMidnight, target);

        Assert.True(move.IsNone);
    }

    [Fact]
    public void Stepping_a_schedule_a_day_and_a_quarter_hour_gives_the_shifted_start()
    {
        var scheduled = ScheduleOccurrence(At(13, 9, 0), At(13, 10, 0));
        var target = CalendarReschedule.StepTarget(scheduled, 1, 15)!.Value;

        var move = CalendarReschedule.Plan(scheduled, target);

        Assert.Equal(CalendarMove.ForSchedule(At(14, 9, 15)), move);
    }

    [Theory]
    [InlineData("10:07", 15, "10:15")]
    [InlineData("10:07", -15, "10:00")]
    [InlineData("10:07", 30, "10:30")]
    [InlineData("10:07", -30, "09:45")]
    [InlineData("10:15", 15, "10:30")]
    [InlineData("10:15", -15, "10:00")]
    [InlineData("10:07", 0, "10:07")]
    [InlineData("23:50", -15, "23:45")]
    public void Minute_steps_from_a_time_between_quarters_land_on_the_quarter_hour_grid(
        string current, int minuteDelta, string expected)
    {
        var timed = DueOccurrence(time: TimeOnly.Parse(current));

        var target = CalendarReschedule.StepTarget(timed, 0, minuteDelta);

        Assert.Equal(TimeOnly.Parse(expected), target?.Time);
    }

    [Fact]
    public void Nudging_the_second_day_of_a_block_that_crosses_midnight_moves_the_whole_schedule()
    {
        var schedule = CalendarEntries.Scheduled(At(13, 23, 0), At(14, 1, 0));
        var secondDay = CalendarLayout.Clip(schedule, TheThirteenth.AddDays(1))!;
        var later = CalendarReschedule.Plan(secondDay, CalendarReschedule.StepTarget(secondDay, 0, 15)!.Value);
        var earlier = CalendarReschedule.Plan(secondDay, CalendarReschedule.StepTarget(secondDay, 0, -15)!.Value);
        var dayBefore = CalendarReschedule.Plan(secondDay, CalendarReschedule.StepTarget(secondDay, -1, 0)!.Value);

        Assert.Equal(CalendarMove.ForSchedule(At(13, 23, 15)), later);
        Assert.True(earlier.IsNone);
        Assert.Equal(CalendarMove.ForSchedule(At(12, 23, 0)), dayBefore);
    }

    private static CalendarDropTarget Target(CalendarDropZone zone, DateOnly day, TimeOnly? time = null)
    {
        return new CalendarDropTarget(zone, day, time);
    }

    private static DateTime At(int day, int hour, int minute)
    {
        return new DateTime(2026, 11, day, hour, minute, 0);
    }

    private static CalendarEntryViewModel DueOccurrence(TimeOnly? time = null)
    {
        return CalendarLayout.Clip(CalendarEntries.Due(TheThirteenth, time: time), TheThirteenth)!;
    }

    private static CalendarEntryViewModel ScheduleOccurrence(DateTime start, DateTime? end)
    {
        return CalendarLayout.Clip(CalendarEntries.Scheduled(start, end), DateOnly.FromDateTime(start))!;
    }
}