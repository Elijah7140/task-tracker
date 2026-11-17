using System.Globalization;

namespace TaskTracker.Core.Search.Syntax;

/// <summary>Reads the date spellings of the query syntax relative to a fixed "today".</summary>
internal sealed class QueryDates
{
    private const int MaxRelativeUnits = 5000;
    private const int DaysPerWeek = 7;

    private readonly DateOnly today;

    public QueryDates(DateOnly today)
    {
        this.today = today;
    }

    /// <summary>
    /// Accepts <c>yyyy-MM-dd</c>, <c>today</c>, <c>tomorrow</c>, <c>yesterday</c>, and offsets such
    /// as <c>+3d</c> or <c>-1w</c> (days and weeks).
    /// </summary>
    public bool TryParse(string value, out DateOnly date)
    {
        if (TryParseKeyword(value, out date))
        {
            return true;
        }

        if (DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date))
        {
            return true;
        }

        return TryParseOffset(value, out date);
    }

    private bool TryParseKeyword(string value, out DateOnly date)
    {
        var offset = KeywordOffset(value);
        date = default;
        return offset is not null && TryAddDays(offset.Value, out date);
    }

    private static int? KeywordOffset(string value)
    {
        if (value.Equals("today", StringComparison.OrdinalIgnoreCase))
        {
            return 0;
        }

        if (value.Equals("tomorrow", StringComparison.OrdinalIgnoreCase))
        {
            return 1;
        }

        return value.Equals("yesterday", StringComparison.OrdinalIgnoreCase) ? -1 : null;
    }

    private bool TryParseOffset(string value, out DateOnly date)
    {
        date = default;

        if (value.Length < 3 || (value[0] != '+' && value[0] != '-'))
        {
            return false;
        }

        var daysPerUnit = DaysPerUnit(value[^1]);
        var digits = value[1..^1];
        var parsed = int.TryParse(digits, NumberStyles.None, CultureInfo.InvariantCulture, out var amount);

        if (daysPerUnit == 0 || !parsed || amount > MaxRelativeUnits)
        {
            return false;
        }

        var sign = value[0] == '-' ? -1 : 1;
        return TryAddDays(sign * amount * daysPerUnit, out date);
    }

    private bool TryAddDays(int days, out DateOnly date)
    {
        date = default;
        var target = (long)today.DayNumber + days;

        if (target < DateOnly.MinValue.DayNumber || target > DateOnly.MaxValue.DayNumber)
        {
            return false;
        }

        date = DateOnly.FromDayNumber((int)target);
        return true;
    }

    private static int DaysPerUnit(char unit)
    {
        return char.ToLowerInvariant(unit) switch
        {
            'd' => 1,
            'w' => DaysPerWeek,
            _ => 0
        };
    }
}