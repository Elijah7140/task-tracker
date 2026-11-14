namespace TaskTracker.Presentation.ViewModels;

/// <summary>One visible calendar day and its entries.</summary>
public sealed class CalendarDayViewModel
{
    public required DateOnly Date { get; init; }

    public required string Label { get; init; }

    public required bool IsOutsideMonth { get; init; }

    public required bool IsToday { get; init; }

    /// <summary>Entries in display order: all-day first, then by start time.</summary>
    public required IReadOnlyList<CalendarEntryViewModel> Entries { get; init; }

    public double Opacity => IsOutsideMonth ? 0.55 : 1;

    /// <summary>The entries a month cell lists before "+N more".</summary>
    public IReadOnlyList<CalendarEntryViewModel> VisibleEntries =>
        Entries.Take(CalendarMetrics.MaxVisibleMonthEntries).ToArray();

    public IReadOnlyList<CalendarEntryViewModel> AllDayEntries => Entries.Where(entry => entry.IsAllDay).ToArray();

    public IReadOnlyList<CalendarEntryViewModel> TimedEntries => Entries.Where(entry => !entry.IsAllDay).ToArray();

    /// <summary>Entries beyond <see cref="CalendarMetrics.MaxVisibleMonthEntries"/>.</summary>
    public int MoreCount => Math.Max(0, Entries.Count - CalendarMetrics.MaxVisibleMonthEntries);

    public bool HasMore => MoreCount > 0;

    public string MoreLabel => $"+{MoreCount} more";
}