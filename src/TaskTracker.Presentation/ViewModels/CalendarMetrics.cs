using System.Globalization;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Sizes shared by the calendar view model, its views and their custom panels.</summary>
public static class CalendarMetrics
{
    /// <summary>Height of one hour in the week time grid, in device-independent pixels.</summary>
    public const double HourHeight = 48;

    /// <summary>Height of a whole 00:00-24:00 day column.</summary>
    public const double DayHeight = HourHeight * 24;

    /// <summary>Vertical pixels for one minute of a timed entry.</summary>
    public const double PixelsPerMinute = HourHeight / 60;

    /// <summary>Minutes in a day column.</summary>
    public const double DayMinutes = 24 * 60;

    /// <summary>
    /// Entries shorter than this are drawn compact, with the urgency label and title on one line.
    /// Heights always follow the real duration; this only chooses how the text is arranged.
    /// </summary>
    public const double TwoLineHeight = 40;

    /// <summary>Hour the week view is scrolled to when it opens.</summary>
    public const int MorningHour = 7;

    /// <summary>Scroll offset that shows <see cref="MorningHour"/> at the top.</summary>
    public const double MorningOffset = MorningHour * HourHeight;

    /// <summary>Dropped entries snap to this many minutes in the week time grid.</summary>
    public const int SnapMinutes = 15;

    /// <summary>Latest start a dropped entry can have: 23:45, so it stays within its day.</summary>
    public const int LastSnapMinute = 24 * 60 - SnapMinutes;

    /// <summary>The pointer must travel this many pixels before a press becomes a drag.</summary>
    public const double DragThreshold = 4;

    /// <summary>Entries a month cell lists before it shows "+N more".</summary>
    public const int MaxVisibleMonthEntries = 3;

    /// <summary>Row labels of the time grid, "00:00" to "23:00".</summary>
    public static IReadOnlyList<string> HourLabels { get; } = CreateHourLabels();

    /// <summary>Vertical offset of a time of day in the week time grid.</summary>
    public static double OffsetOf(TimeOnly time)
    {
        return time.Hour * HourHeight + time.Minute * PixelsPerMinute;
    }

    private static string[] CreateHourLabels()
    {
        var labels = new string[24];

        for (var hour = 0; hour < labels.Length; hour++)
        {
            labels[hour] = hour.ToString("00", CultureInfo.InvariantCulture) + ":00";
        }

        return labels;
    }
}