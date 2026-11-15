using System.Globalization;

using TaskTracker.Core.Calendar;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Pure day clipping, month layout and timed overlap placement.</summary>
public static class CalendarLayout
{
    /// <summary>Returns the first day of the week that contains <paramref name="day"/>.</summary>
    public static DateOnly StartOfWeek(DateOnly day, DayOfWeek firstDay)
    {
        var offset = ((int)day.DayOfWeek - (int)firstDay + 7) % 7;
        return day.AddDays(-offset);
    }

    /// <summary>Formats the seven days starting at <paramref name="first"/> in the culture's day order.</summary>
    public static string WeekTitle(DateOnly first, CultureInfo culture)
    {
        var last = first.AddDays(6);
        var dayFirst = IsDayFirst(culture);

        if (dayFirst && first.Year == last.Year && first.Month == last.Month)
        {
            return $"{first.Day}. – {last.Day}. {last.ToString("MMM", culture)} {last.Year}";
        }

        var firstLabel = FormatMonthDay(first, culture);

        if (first.Year != last.Year)
        {
            return $"{firstLabel}, {first.Year} – {FormatMonthDay(last, culture)}, {last.Year}";
        }

        var lastLabel = first.Month == last.Month
            ? FormatDay(last, culture)
            : FormatMonthDay(last, culture);
        var separator = dayFirst ? " " : ", ";
        return $"{firstLabel} – {lastLabel}{separator}{last.Year}";
    }

    /// <summary>
    /// Builds <paramref name="count"/> consecutive days from <paramref name="start"/>. Each day holds
    /// the entries clipped to it, in display order, with overlapping timed blocks already placed side by side.
    /// </summary>
    public static IReadOnlyList<CalendarDayViewModel> BuildDays(
        DateOnly start, int count, DateOnly selectedMonth, DateOnly today,
        IReadOnlyList<CalendarEntry> entries, CultureInfo culture)
    {
        var days = new List<CalendarDayViewModel>();

        for (var index = 0; index < count; index++)
        {
            var date = start.AddDays(index);
            var occurrences = ClipDay(entries, date, culture);
            SplitOverlaps(occurrences);
            days.Add(new CalendarDayViewModel
            {
                Date = date,
                Label = date.ToString("ddd d", culture),
                IsOutsideMonth = date.Month != selectedMonth.Month || date.Year != selectedMonth.Year,
                IsToday = date == today,
                Entries = occurrences
            });
        }

        return days;
    }

    /// <summary>
    /// Cuts an entry down to one day. A due entry belongs to its date; a scheduled block belongs
    /// to every day it overlaps and is clipped to midnight. A missing, zero or negative length
    /// gives a block of <see cref="CalendarEntry.DefaultBlockLength"/>. Returns null when the
    /// entry does not touch the day. Times are floating local values, so a daylight-saving day
    /// is laid out like any other.
    /// </summary>
    public static CalendarEntryViewModel? Clip(CalendarEntry entry, DateOnly day)
    {
        if (entry.Kind == CalendarEntryKind.Due)
        {
            return entry.Date == day ? Create(entry, day, entry.StartTime, null) : null;
        }

        if (entry.ScheduledStart is not DateTime start || entry.EffectiveScheduledEnd is not DateTime end)
        {
            return null;
        }

        var dayStart = day.ToDateTime(TimeOnly.MinValue);
        var dayEnd = dayStart.AddDays(1);

        if (start >= dayEnd || end <= dayStart)
        {
            return null;
        }

        var clippedStart = start < dayStart ? dayStart : start;
        var clippedEnd = end > dayEnd ? dayEnd : end;
        var endTime = clippedEnd == dayEnd ? TimeOnly.MaxValue : TimeOnly.FromDateTime(clippedEnd);
        return Create(entry, day, TimeOnly.FromDateTime(clippedStart), endTime);
    }

    private static List<CalendarEntryViewModel> ClipDay(
        IReadOnlyList<CalendarEntry> entries, DateOnly day, CultureInfo culture)
    {
        var occurrences = new List<CalendarEntryViewModel>();

        foreach (var entry in entries)
        {
            var occurrence = Clip(entry, day);

            if (occurrence is not null)
            {
                occurrences.Add(occurrence);
            }
        }

        occurrences.Sort((left, right) => CompareForDisplay(left, right, culture));
        return occurrences;
    }

    /// <summary>All-day first, then by start, then title (culture-aware, ignoring case), then item id.</summary>
    private static int CompareForDisplay(
        CalendarEntryViewModel left, CalendarEntryViewModel right, CultureInfo culture)
    {
        var byAllDay = right.IsAllDay.CompareTo(left.IsAllDay);

        if (byAllDay != 0)
        {
            return byAllDay;
        }

        var byStart = Nullable.Compare(left.Start, right.Start);

        if (byStart != 0)
        {
            return byStart;
        }

        var byTitle = culture.CompareInfo.Compare(left.Entry.Title, right.Entry.Title, CompareOptions.IgnoreCase);

        if (byTitle != 0)
        {
            return byTitle;
        }

        var byItem = left.Entry.ItemId.CompareTo(right.Entry.ItemId);
        return byItem != 0 ? byItem : left.Entry.Kind.CompareTo(right.Entry.Kind);
    }

    private static bool IsDayFirst(CultureInfo culture)
    {
        return culture.DateTimeFormat.MonthDayPattern.StartsWith('d');
    }

    private static string FormatMonthDay(DateOnly date, CultureInfo culture)
    {
        return date.ToString(IsDayFirst(culture) ? "d. MMM" : "MMM d", culture);
    }

    private static string FormatDay(DateOnly date, CultureInfo culture)
    {
        return IsDayFirst(culture) ? $"{date.Day}." : date.Day.ToString(culture);
    }

    private static CalendarEntryViewModel Create(CalendarEntry entry, DateOnly day, TimeOnly? start, TimeOnly? end)
    {
        return new CalendarEntryViewModel
        {
            Entry = entry,
            Day = day,
            Start = start,
            End = end
        };
    }

    private static void SplitOverlaps(IReadOnlyList<CalendarEntryViewModel> entries)
    {
        var timed = entries.Where(entry => !entry.IsAllDay).OrderBy(entry => entry.LayoutStartMinutes).ToArray();
        var group = new List<CalendarEntryViewModel>();
        var groupEnd = 0.0;

        foreach (var entry in timed)
        {
            if (group.Count > 0 && entry.LayoutStartMinutes >= groupEnd)
            {
                PlaceGroup(group);
                group.Clear();
            }

            group.Add(entry);
            groupEnd = Math.Max(groupEnd, entry.LayoutEndMinutes);
        }

        PlaceGroup(group);
    }

    private static void PlaceGroup(IReadOnlyList<CalendarEntryViewModel> group)
    {
        var columnEnds = new List<double>();
        var assignments = new List<int>();

        foreach (var entry in group)
        {
            var column = columnEnds.FindIndex(end => end <= entry.LayoutStartMinutes);

            if (column < 0)
            {
                column = columnEnds.Count;
                columnEnds.Add(0);
            }

            columnEnds[column] = entry.LayoutEndMinutes;
            assignments.Add(column);
        }

        for (var index = 0; index < group.Count; index++)
        {
            group[index].WidthFraction = 1.0 / columnEnds.Count;
            group[index].LeftFraction = assignments[index] * group[index].WidthFraction;
        }
    }
}