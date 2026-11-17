using System.Globalization;

namespace TaskTracker.Core.Items.Recurrence;

/// <summary>The schedule and end condition for a repeating item.</summary>
public readonly record struct RecurrenceRule(
    RecurrenceFrequency Frequency,
    int Interval = 1,
    RecurrenceWeekdays? Weekdays = null,
    int? MonthDay = null,
    int? Month = null,
    RecurrenceAnchor Anchor = RecurrenceAnchor.DueDate,
    RecurrenceEndKind EndKind = RecurrenceEndKind.Never,
    DateOnly? EndDate = null,
    int? Remaining = null)
{
    private static readonly string[] DayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    /// <summary>Returns the first error to display in the editor or domain operation.</summary>
    public (string Property, string Message)? FindError()
    {
        foreach (var error in ValidationErrors())
        {
            return error;
        }

        return null;
    }

    /// <summary>Reports invalid properties individually so import can identify their paths.</summary>
    internal IEnumerable<(string Property, string Message)> ValidationErrors()
    {
        if (!Enum.IsDefined(Frequency))
        {
            yield return (nameof(Frequency), "Choose a repeat frequency.");
        }

        if (Interval < 1)
        {
            yield return (nameof(Interval), "Repeat interval must be positive.");
        }

        if (!Enum.IsDefined(Anchor))
        {
            yield return (nameof(Anchor), "Choose a repeat anchor.");
        }

        foreach (var error in PatternErrors().Concat(EndErrors()))
        {
            yield return error;
        }
    }

    private IEnumerable<(string, string)> PatternErrors()
    {
        if (Frequency == RecurrenceFrequency.Weekly ? !ValidWeekdays() : Weekdays is not null)
        {
            yield return (nameof(Weekdays), "Choose at least one valid weekday for weekly repeats only.");
        }

        var validMonth = Month is >= 1 and <= 12;
        if (Frequency == RecurrenceFrequency.Yearly ? !validMonth : Month is not null)
        {
            yield return (nameof(Month), "A valid month is required for yearly repeats only.");
        }

        var validDay = Frequency switch
        {
            RecurrenceFrequency.Monthly => MonthDay is >= 0 and <= 31,
            RecurrenceFrequency.Yearly => MonthDay is >= 1 and <= 31 &&
                (!validMonth || MonthDay <= DateTime.DaysInMonth(2000, Month!.Value)),
            _ => MonthDay is null
        };

        if (!validDay)
        {
            yield return (nameof(MonthDay), "Choose a valid day for the repeat frequency.");
        }
    }

    private bool ValidWeekdays()
    {
        return Weekdays is { } days && days != RecurrenceWeekdays.None && (days & ~RecurrenceWeekdays.All) == 0;
    }

    private IEnumerable<(string, string)> EndErrors()
    {
        if (!Enum.IsDefined(EndKind))
        {
            yield return (nameof(EndKind), "Choose how the repeat ends.");
            yield break;
        }

        if ((EndKind == RecurrenceEndKind.OnDate) != EndDate.HasValue)
        {
            yield return (nameof(EndDate), "An end date is required only when the repeat ends on a date.");
        }

        if (EndKind == RecurrenceEndKind.AfterCount ? Remaining is not > 0 : Remaining is not null)
        {
            yield return (nameof(Remaining), "A positive occurrence count is required only for a count limit.");
        }
    }

    /// <summary>Describes the pattern in plain English.</summary>
    public string Describe()
    {
        return Frequency switch
        {
            RecurrenceFrequency.Daily => DescribeInterval("Daily", "days"),
            RecurrenceFrequency.Weekly => $"{DescribeInterval("Weekly", "weeks")} on {DescribeWeekdays()}",
            RecurrenceFrequency.Monthly => $"{DescribeInterval("Monthly", "months")} on {DescribeMonthDay()}",
            RecurrenceFrequency.Yearly => $"{DescribeInterval("Every year", "years")} on {DescribeYearDay()}",
            _ => string.Empty
        };
    }

    private string DescribeInterval(string singular, string plural)
    {
        return Interval == 1 ? singular : $"Every {Interval} {plural}";
    }

    private string DescribeWeekdays()
    {
        var days = Weekdays.GetValueOrDefault();
        return string.Join(", ", DayNames.Where((name, index) => (days & (RecurrenceWeekdays)(1 << index)) != 0));
    }

    private string DescribeMonthDay()
    {
        return MonthDay == 0 ? "the last day" : $"day {MonthDay}";
    }

    private string DescribeYearDay()
    {
        var month = CultureInfo.InvariantCulture.DateTimeFormat.GetAbbreviatedMonthName(Month!.Value);
        return $"{MonthDay} {month}";
    }
}