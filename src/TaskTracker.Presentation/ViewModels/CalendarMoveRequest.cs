using TaskTracker.Core.Calendar;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// A drop or key step waiting to be applied. It is planned only when it runs, against the entry as the
/// latest load shows it, so a reload between the gesture and the save cannot cause a stale move.
/// </summary>
/// <param name="Occurrence">The entry occurrence the gesture started on.</param>
/// <param name="Drop">Where the entry was dropped; null for a key step.</param>
/// <param name="DayDelta">Whole days of a key step.</param>
/// <param name="MinuteDelta">Minutes of a key step.</param>
/// <param name="RestoreFocus">True when the view should focus the entry again after the move.</param>
internal sealed record CalendarMoveRequest(
    CalendarEntryViewModel Occurrence, CalendarDropTarget? Drop, int DayDelta, int MinuteDelta, bool RestoreFocus)
{
    /// <summary>The entry this request moves.</summary>
    public CalendarEntryKey Key => new(Occurrence.Entry.ItemId, Occurrence.Entry.Kind);

    public static CalendarMoveRequest ForDrop(CalendarEntryViewModel occurrence, CalendarDropTarget drop)
    {
        return new CalendarMoveRequest(occurrence, drop, 0, 0, false);
    }

    public static CalendarMoveRequest ForStep(CalendarEntryViewModel occurrence, int dayDelta, int minuteDelta)
    {
        return new CalendarMoveRequest(occurrence, null, dayDelta, minuteDelta, true);
    }

    /// <summary>
    /// Combines this waiting request with a newer one. Key steps on the same entry add up, so a held key
    /// keeps moving the entry; in every other case the newer request replaces this one.
    /// </summary>
    public CalendarMoveRequest Merge(CalendarMoveRequest newer)
    {
        var bothAreSteps = Drop is null && newer.Drop is null;

        if (!bothAreSteps || Key != newer.Key)
        {
            return newer;
        }

        var minutes = newer.Occurrence.IsAllDay ? MinuteDelta : MinuteDelta + newer.MinuteDelta;
        return newer with { DayDelta = DayDelta + newer.DayDelta, MinuteDelta = minutes };
    }

    /// <summary>The drop target this request asks for, for the entry as it is now; null when it cannot move.</summary>
    public CalendarDropTarget? TargetFor(CalendarEntryViewModel current)
    {
        if (Drop is CalendarDropTarget drop)
        {
            return drop;
        }

        return CalendarReschedule.StepTarget(current, DayDelta, MinuteDelta);
    }
}