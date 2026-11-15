using TaskTracker.Core.Calendar;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// Pure rules for what dropping or nudging a calendar entry changes. The view translates pointer
/// events into a <see cref="CalendarDropTarget"/>; keys become one through <see cref="StepTarget"/>.
/// </summary>
public static class CalendarReschedule
{
    /// <summary>False for drops that are never allowed: a schedule needs a time, so it cannot go on the all-day row.</summary>
    public static bool Accepts(CalendarEntryViewModel occurrence, CalendarDropZone zone)
    {
        var isSchedule = occurrence.Entry.Kind == CalendarEntryKind.Scheduled;
        return !(isSchedule && zone == CalendarDropZone.AllDayRow);
    }

    /// <summary>Works out the change a drop asks for; <see cref="CalendarMove.None"/> when nothing would change.</summary>
    public static CalendarMove Plan(CalendarEntryViewModel occurrence, CalendarDropTarget target)
    {
        if (!Accepts(occurrence, target.Zone))
        {
            return CalendarMove.None;
        }

        if (occurrence.Entry.Kind == CalendarEntryKind.Due)
        {
            return PlanDue(occurrence.Entry, target);
        }

        return PlanSchedule(occurrence, target);
    }

    /// <summary>
    /// The drop target a key press stands for: whole days, and minutes for entries that have a time.
    /// Returns null when the entry cannot move that way (an all-day entry has no time to nudge).
    /// A timed entry never crosses midnight; it stops at 00:00 and 23:45.
    /// </summary>
    public static CalendarDropTarget? StepTarget(CalendarEntryViewModel occurrence, int dayDelta, int minuteDelta)
    {
        var day = occurrence.Day.AddDays(dayDelta);

        if (occurrence.IsAllDay)
        {
            return minuteDelta == 0 ? new CalendarDropTarget(CalendarDropZone.AllDayRow, day, null) : null;
        }

        var time = SteppedTime(occurrence.Start ?? TimeOnly.MinValue, minuteDelta);
        return new CalendarDropTarget(CalendarDropZone.TimeGrid, day, time);
    }

    /// <summary>
    /// Steps a time by whole quarter hours. A time between quarters first lands on the quarter in the
    /// direction of the step: 10:07 goes to 10:15 going later and to 10:00 going earlier.
    /// </summary>
    private static TimeOnly SteppedTime(TimeOnly current, int minuteDelta)
    {
        if (minuteDelta == 0)
        {
            return current;
        }

        var currentMinutes = current.Hour * 60 + current.Minute;
        var quarterStart = currentMinutes - currentMinutes % CalendarMetrics.SnapMinutes;
        var moved = quarterStart + minuteDelta;

        if (currentMinutes != quarterStart && minuteDelta < 0)
        {
            moved += CalendarMetrics.SnapMinutes;
        }

        if (moved > CalendarMetrics.LastSnapMinute)
        {
            moved = Math.Max(currentMinutes, CalendarMetrics.LastSnapMinute);
        }

        moved = Math.Max(moved, 0);
        return new TimeOnly(moved / 60, moved % 60);
    }

    private static CalendarMove PlanDue(CalendarEntry entry, CalendarDropTarget target)
    {
        var time = DueTimeAfterDrop(entry, target);

        if (target.Day == entry.DueDate && time == entry.DueTime)
        {
            return CalendarMove.None;
        }

        return CalendarMove.ForDue(target.Day, time);
    }

    private static TimeOnly? DueTimeAfterDrop(CalendarEntry entry, CalendarDropTarget target)
    {
        switch (target.Zone)
        {
            case CalendarDropZone.MonthCell:
                return entry.DueTime;
            case CalendarDropZone.AllDayRow:
                return null;
            default:
                return target.Time;
        }
    }

    /// <summary>
    /// A schedule moves by the distance between where its dragged day occurrence started and where
    /// that occurrence now starts. Using the occurrence keeps a block that runs past midnight
    /// consistent whichever of its days is dragged.
    /// </summary>
    private static CalendarMove PlanSchedule(CalendarEntryViewModel occurrence, CalendarDropTarget target)
    {
        if (occurrence.Entry.ScheduledStart is not DateTime start)
        {
            return CalendarMove.None;
        }

        var oldOccurrenceStart = occurrence.Day.ToDateTime(occurrence.Start ?? TimeOnly.MinValue);
        var newOccurrenceStart = target.Day.ToDateTime(ScheduleTimeAfterDrop(occurrence, target));
        var shift = newOccurrenceStart - oldOccurrenceStart;

        if (shift == TimeSpan.Zero)
        {
            return CalendarMove.None;
        }

        return CalendarMove.ForSchedule(start + shift);
    }

    private static TimeOnly ScheduleTimeAfterDrop(CalendarEntryViewModel occurrence, CalendarDropTarget target)
    {
        var current = occurrence.Start ?? TimeOnly.MinValue;

        if (target.Zone == CalendarDropZone.MonthCell)
        {
            return current;
        }

        return target.Time ?? current;
    }
}