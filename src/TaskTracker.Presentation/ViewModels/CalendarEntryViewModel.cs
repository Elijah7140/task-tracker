using System.Windows.Input;

using TaskTracker.Core.Calendar;
using TaskTracker.Core.Items;
using TaskTracker.Core.Urgency;

using UrgencyLevel = TaskTracker.Core.Urgency.Urgency;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>An item occurrence on one day, with display and week positioning data.</summary>
public sealed class CalendarEntryViewModel : ViewModelBase
{
    private UrgencyLevel urgency;

    public required CalendarEntry Entry { get; init; }

    public required DateOnly Day { get; init; }

    /// <summary>Start of the entry on this day; null for an all-day due date.</summary>
    public required TimeOnly? Start { get; init; }

    /// <summary>End of a scheduled block on this day; null for due entries.</summary>
    public required TimeOnly? End { get; init; }

    /// <summary>Vertical offset in the week time grid.</summary>
    public double Top => LayoutStartMinutes * CalendarMetrics.PixelsPerMinute;

    /// <summary>
    /// Height in the week time grid, from the real duration (48 pixels per hour). A due marker takes
    /// the default block length, so it is as tall as a schedule without an end.
    /// </summary>
    public double Height => DurationMinutes * CalendarMetrics.PixelsPerMinute;

    /// <summary>True for entries too short to stack the urgency label above the title.</summary>
    public bool IsCompact => Height < CalendarMetrics.TwoLineHeight;

    /// <summary>
    /// Minute of the day where the entry is drawn from. A due marker that would run past the end of the
    /// day is moved up so that all of it stays inside the day column.
    /// </summary>
    public double LayoutStartMinutes
    {
        get
        {
            var startMinutes = (Start ?? TimeOnly.MinValue).ToTimeSpan().TotalMinutes;
            return Math.Min(startMinutes, CalendarMetrics.DayMinutes - DurationMinutes);
        }
    }

    /// <summary>Minute of the day where the drawn entry ends; overlaps are decided from these intervals.</summary>
    public double LayoutEndMinutes => LayoutStartMinutes + DurationMinutes;

    public double DurationMinutes
    {
        get
        {
            if (Start is not TimeOnly start || End is not TimeOnly end)
            {
                return CalendarEntry.DefaultBlockLength.TotalMinutes;
            }

            return (end - start).TotalMinutes;
        }
    }

    public bool IsAllDay => Entry.Kind == CalendarEntryKind.Due && Start is null;

    public double Opacity => Entry.IsCompleted ? 0.55 : 1;

    public string Label
    {
        get
        {
            var checkMark = Entry.IsCompleted ? "✓ " : string.Empty;
            return checkMark + Entry.Title;
        }
    }

    /// <summary>The label with the start time in front when the entry has one.</summary>
    public string MonthLabel
    {
        get
        {
            if (Start is not TimeOnly time)
            {
                return Label;
            }

            return $"{time:HH:mm} {Label}";
        }
    }

    /// <summary>Approaching, Imminent or Overdue; empty when there is no urgency. Never colour alone (§6.3).</summary>
    public string UrgencyLabel => Urgency == UrgencyLevel.None ? string.Empty : Urgency.ToString();

    public bool HasUrgencyLabel => Urgency != UrgencyLevel.None;

    public bool IsOverdue => Urgency == UrgencyLevel.Overdue;

    public ICommand? PushBackCommand { get; internal set; }

    public string? StatusName { get; internal set; }

    public bool HasStatus => StatusName is not null;

    public IReadOnlyList<RowLookupChoice> StatusChoices { get; internal set; } = [];

    public IReadOnlyList<RowLookupChoice> PriorityChoices { get; internal set; } = [];

    public string? PushBackReason => PushBackOneDay.UnavailableReason(Entry.IsCompleted, hasDates: true);

    /// <summary>Type, priority and status; one-line entries have no room for a status chip.</summary>
    public string Tooltip
    {
        get
        {
            var summary = $"{Entry.ItemType ?? "No type"} · {Entry.Priority ?? "No priority"}";
            return StatusName is null ? summary : $"{summary} · {StatusName}";
        }
    }

    /// <summary>Share of the day column width, less than one when overlapping blocks split it.</summary>
    public double WidthFraction { get; set; } = 1;

    /// <summary>Left edge as a share of the day column width.</summary>
    public double LeftFraction { get; set; }

    public UrgencyLevel Urgency
    {
        get => urgency;
        private set
        {
            if (SetProperty(ref urgency, value))
            {
                OnPropertyChanged(nameof(UrgencyLabel));
                OnPropertyChanged(nameof(HasUrgencyLabel));
                OnPropertyChanged(nameof(IsOverdue));
            }
        }
    }

    /// <summary>Recomputes the entry's own urgency; a completed entry has none.</summary>
    public void RefreshUrgency(DateTime nowUtc, TimeZoneInfo zone)
    {
        if (Entry.IsCompleted)
        {
            Urgency = UrgencyLevel.None;
            return;
        }

        var deadline = UrgencyCalculator.EffectiveDeadline(Entry.DueDate, Entry.DueTime,
            Entry.ScheduledStart, zone);
        Urgency = UrgencyCalculator.Calculate(deadline, nowUtc, Entry.Thresholds);
    }
}