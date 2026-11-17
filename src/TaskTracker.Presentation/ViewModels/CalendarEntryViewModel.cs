using TaskTracker.Core.Calendar;
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
    public double Top
    {
        get
        {
            return CalendarMetrics.OffsetOf(Start ?? TimeOnly.MinValue);
        }
    }

    /// <summary>Height in the week time grid: a marker for due entries, a scaled block for schedules.</summary>
    public double Height
    {
        get
        {
            if (Entry.Kind == CalendarEntryKind.Due)
            {
                return CalendarMetrics.MinEntryHeight;
            }

            return Math.Max(CalendarMetrics.MinEntryHeight, DurationMinutes * CalendarMetrics.PixelsPerMinute);
        }
    }

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

    public string Tooltip => $"{Entry.ItemType ?? "No type"} · {Entry.Priority ?? "No priority"}";

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