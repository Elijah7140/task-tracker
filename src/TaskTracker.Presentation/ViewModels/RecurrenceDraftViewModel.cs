using System.Globalization;

using TaskTracker.Core;
using TaskTracker.Core.Items;
using TaskTracker.Core.Items.Recurrence;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Edits a recurrence rule independently of the stored occurrence.</summary>
public sealed class RecurrenceDraftViewModel : ViewModelBase
{
    private readonly Func<DateOnly?> getDate;
    private readonly RecurrenceRule? originalRule;
    private readonly DateOnly? originalDate;
    private int frequencyIndex;
    private string intervalText;
    private string monthDayText;
    private bool useLastDay;
    private int anchorIndex;
    private int endIndex;
    private DateTime? endDate;
    private string countText;

    public RecurrenceDraftViewModel(TodoItem item, Func<DateOnly?> getDate)
    {
        this.getDate = getDate;
        originalDate = item.RecurrenceDate;
        originalRule = item.Recurrence;
        frequencyIndex = (int)(originalRule?.Frequency ?? 0);
        intervalText = FormatNumber(originalRule?.Interval ?? 1);
        monthDayText = FormatNumber(originalRule?.MonthDay is > 0 ? originalRule.Value.MonthDay!.Value : originalDate?.Day ?? 1);
        useLastDay = originalRule?.MonthDay == 0;
        anchorIndex = (int)(originalRule?.Anchor ?? RecurrenceAnchor.DueDate) - 1;
        endIndex = (int)(originalRule?.EndKind ?? RecurrenceEndKind.Never) - 1;
        endDate = originalRule?.EndDate?.ToDateTime(TimeOnly.MinValue);
        countText = FormatNumber(originalRule?.Remaining ?? 1);
        Weekdays = CreateWeekdays(originalRule?.Weekdays ?? DefaultWeekday(originalDate));
        CanSkip = originalRule is not null && item.CompletedAtUtc is null;
    }

    public IReadOnlyList<string> Frequencies { get; } = ["Does not repeat", "Daily", "Weekly", "Monthly", "Yearly"];

    public IReadOnlyList<string> Anchors { get; } = ["From the due date", "From the completion date"];

    public IReadOnlyList<string> EndOptions { get; } = ["Never", "On a date", "After a number of occurrences"];

    public IReadOnlyList<RecurrenceWeekdayViewModel> Weekdays { get; }

    public int FrequencyIndex
    {
        get => frequencyIndex;
        set
        {
            if (SetProperty(ref frequencyIndex, value))
            {
                OnPropertyChanged(nameof(IsRepeating));
                OnPropertyChanged(nameof(IsWeekly));
                OnPropertyChanged(nameof(IsMonthly));
                RefreshSummary();
            }
        }
    }

    public string IntervalText
    {
        get => intervalText;
        set
        {
            if (SetProperty(ref intervalText, value))
            {
                RefreshSummary();
            }
        }
    }

    public string MonthDayText
    {
        get => monthDayText;
        set
        {
            if (SetProperty(ref monthDayText, value))
            {
                RefreshSummary();
            }
        }
    }

    public bool UseLastDay
    {
        get => useLastDay;
        set
        {
            if (SetProperty(ref useLastDay, value))
            {
                RefreshSummary();
            }
        }
    }

    public int AnchorIndex
    {
        get => anchorIndex;
        set
        {
            if (SetProperty(ref anchorIndex, value))
            {
                RefreshSummary();
            }
        }
    }

    public int EndIndex
    {
        get => endIndex;
        set
        {
            if (SetProperty(ref endIndex, value))
            {
                OnPropertyChanged(nameof(EndsOnDate));
                OnPropertyChanged(nameof(EndsAfterCount));
                RefreshSummary();
            }
        }
    }

    public DateTime? EndDate
    {
        get => endDate;
        set
        {
            if (SetProperty(ref endDate, value))
            {
                RefreshSummary();
            }
        }
    }

    public string CountText
    {
        get => countText;
        set
        {
            if (SetProperty(ref countText, value))
            {
                RefreshSummary();
            }
        }
    }

    public bool IsRepeating => FrequencyIndex > 0;

    public bool IsWeekly => FrequencyIndex == (int)RecurrenceFrequency.Weekly;

    public bool IsMonthly => FrequencyIndex == (int)RecurrenceFrequency.Monthly;

    public bool EndsOnDate => EndIndex + 1 == (int)RecurrenceEndKind.OnDate;

    public bool EndsAfterCount => EndIndex + 1 == (int)RecurrenceEndKind.AfterCount;

    public bool CanStop => originalRule is not null;

    public bool CanSkip { get; }

    public string? Error
    {
        get
        {
            if (!IsRepeating)
            {
                return null;
            }

            if (getDate() is null)
            {
                return "A repeating item needs a due date or a scheduled start.";
            }

            return BuildRule()?.FindError()?.Message;
        }
    }

    public bool HasError => Error is not null;

    public string? Summary => HasError ? null : BuildRule()?.Describe();

    /// <summary>Refreshes the preview when the containing editor's dates change.</summary>
    public void RefreshSummary()
    {
        OnPropertyChanged(nameof(Error));
        OnPropertyChanged(nameof(HasError));
        OnPropertyChanged(nameof(Summary));
    }

    /// <summary>Builds a validated rule for an explicit save.</summary>
    public RecurrenceRule? ToRule()
    {
        if (Error is { } error)
        {
            throw new DomainRuleException(error);
        }

        return BuildRule();
    }

    private RecurrenceRule? BuildRule()
    {
        if (!IsRepeating)
        {
            return null;
        }

        var frequency = (RecurrenceFrequency)FrequencyIndex;
        var (month, day) = MonthAndDay(frequency);
        return new RecurrenceRule(frequency, ReadNumber(IntervalText), IsWeekly ? SelectedDays() : null, day, month,
            (RecurrenceAnchor)(AnchorIndex + 1), (RecurrenceEndKind)(EndIndex + 1),
            EndsOnDate && EndDate is { } date ? DateOnly.FromDateTime(date) : null,
            EndsAfterCount ? ReadNumber(CountText) : null);
    }

    private (int? Month, int? Day) MonthAndDay(RecurrenceFrequency frequency)
    {
        if (frequency == RecurrenceFrequency.Monthly)
        {
            return (null, UseLastDay ? 0 : ReadNumber(MonthDayText, -1));
        }

        if (frequency != RecurrenceFrequency.Yearly)
        {
            return (null, null);
        }

        var date = getDate();
        if (originalRule is { Frequency: RecurrenceFrequency.Yearly } saved && date == originalDate)
        {
            return (saved.Month, saved.MonthDay);
        }

        return (date?.Month, date?.Day);
    }

    private IReadOnlyList<RecurrenceWeekdayViewModel> CreateWeekdays(RecurrenceWeekdays selected)
    {
        string[] labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        var weekdays = new List<RecurrenceWeekdayViewModel>(labels.Length);
        for (var index = 0; index < labels.Length; index++)
        {
            var day = (RecurrenceWeekdays)(1 << index);
            var weekday = new RecurrenceWeekdayViewModel(labels[index], day, selected.HasFlag(day));
            weekday.PropertyChanged += (_, _) => RefreshSummary();
            weekdays.Add(weekday);
        }

        return weekdays;
    }

    private RecurrenceWeekdays SelectedDays()
    {
        var days = RecurrenceWeekdays.None;
        foreach (var day in Weekdays.Where(day => day.IsSelected))
        {
            days |= day.Day;
        }

        return days;
    }

    private static RecurrenceWeekdays DefaultWeekday(DateOnly? date)
    {
        var weekday = date?.DayOfWeek ?? DayOfWeek.Monday;
        return (RecurrenceWeekdays)(1 << (((int)weekday + 6) % 7));
    }

    private static int ReadNumber(string text, int fallback = 0)
    {
        return int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var value) ? value : fallback;
    }

    private static string FormatNumber(int value)
    {
        return value.ToString(CultureInfo.InvariantCulture);
    }
}