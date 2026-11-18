using System.Globalization;

using TaskTracker.Core.Fields;

namespace TaskTracker.Core.Search.Syntax;

/// <summary>
/// Turns the text written after an operator into a typed <see cref="FilterValue"/>.
/// Numbers always use the invariant culture (a dot for decimals) so a saved search means
/// the same thing on every machine.
/// </summary>
internal sealed class QueryValueReader
{
    private readonly QueryDates dates;
    private readonly IReadOnlyDictionary<string, IReadOnlyList<SearchChoice>> choices;

    public QueryValueReader(QueryDates dates, IReadOnlyDictionary<string, IReadOnlyList<SearchChoice>> choices)
    {
        this.dates = dates;
        this.choices = choices;
    }

    /// <summary>The choices a choice field offers, or an empty list for other fields.</summary>
    public IReadOnlyList<SearchChoice> OptionsFor(SearchableField field)
    {
        return choices.TryGetValue(field.Key, out var options) ? options : [];
    }

    /// <summary>Reads one value for the field's data type.</summary>
    public ValueOutcome Read(SearchableField field, QueryEndpoint endpoint)
    {
        if (string.IsNullOrWhiteSpace(endpoint.Value))
        {
            return ValueOutcome.Fail("A value is needed here.");
        }

        return field.DataType switch
        {
            FieldDataType.Text => ReadText(endpoint.Value),
            FieldDataType.Number => ReadNumber(endpoint.Value.Trim()),
            FieldDataType.Date => ReadDate(endpoint.Value.Trim()),
            FieldDataType.Boolean => ReadBoolean(endpoint.Value.Trim()),
            FieldDataType.Choice => ReadChoice(field, endpoint.Value.Trim(), endpoint.Quoted),
            _ => ValueOutcome.Fail("This field cannot be searched by value.")
        };
    }

    /// <summary>Reads both ends of an <c>a..b</c> range and checks they run low to high.</summary>
    public ValueOutcome ReadRange(SearchableField field, QueryEndpoint first, QueryEndpoint second)
    {
        var low = Read(field, first);

        if (low.Error is not null)
        {
            return low;
        }

        var high = Read(field, second);

        if (high.Error is not null)
        {
            return high;
        }

        return Combine(field, low, high);
    }

    private static ValueOutcome ReadText(string value)
    {
        return ValueOutcome.Ok(new FilterValue.Text(value), QueryQuoting.QuoteIfNeeded(value));
    }

    private static ValueOutcome ReadNumber(string value)
    {
        var parsed = double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var number);

        if (!parsed || !double.IsFinite(number))
        {
            return ValueOutcome.Fail($"'{value}' is not a number. Write decimals with a dot, like 2.5.");
        }

        return ValueOutcome.Ok(new FilterValue.Number(number), value);
    }

    private ValueOutcome ReadDate(string value)
    {
        if (!dates.TryParse(value, out var date))
        {
            return ValueOutcome.Fail($"'{value}' is not a date. Use yyyy-MM-dd, today, tomorrow, yesterday, "
                + "or an offset like +3d or -1w.");
        }

        return ValueOutcome.Ok(new FilterValue.Date(date), value);
    }

    private static ValueOutcome ReadBoolean(string value)
    {
        var isYes = value.Equals("yes", StringComparison.OrdinalIgnoreCase)
            || value.Equals("true", StringComparison.OrdinalIgnoreCase);
        var isNo = value.Equals("no", StringComparison.OrdinalIgnoreCase)
            || value.Equals("false", StringComparison.OrdinalIgnoreCase);

        if (!isYes && !isNo)
        {
            return ValueOutcome.Fail($"'{value}' is not yes or no.");
        }

        return ValueOutcome.Ok(new FilterValue.Bool(isYes), isYes ? "yes" : "no");
    }

    private ValueOutcome ReadChoice(SearchableField field, string value, bool quoted)
    {
        var options = OptionsFor(field);
        var match = FindChoice(options, value, quoted);

        if (match is null)
        {
            return ValueOutcome.Fail(UnknownChoiceMessage(field, value, options));
        }

        return ValueOutcome.Ok(new FilterValue.Choice(match.Id), $"#{match.Id:D}", QueryQuoting.FormatChoice(match, field.Key));
    }

    private static SearchChoice? FindChoice(IReadOnlyList<SearchChoice> options, string value, bool quoted)
    {
        var isId = !quoted && value.StartsWith('#') && Guid.TryParse(value.AsSpan(1), out _);

        if (isId)
        {
            var id = Guid.Parse(value.AsSpan(1));
            return options.FirstOrDefault(option => option.Id == id);
        }

        var numbered = quoted ? null : FindByPriorityNumber(options, value);
        return numbered
            ?? options.FirstOrDefault(option => SameText(option.Name ?? option.Label, value))
            ?? options.FirstOrDefault(option => SameText(option.Label, value));
    }

    /// <summary>An unquoted whole number matches the priority level with that number first (§7.15).</summary>
    private static SearchChoice? FindByPriorityNumber(IReadOnlyList<SearchChoice> options, string value)
    {
        if (!QueryQuoting.IsPriorityNumber(value, out var number))
        {
            return null;
        }

        return options.FirstOrDefault(option => option.Number == number);
    }

    private static bool SameText(string left, string right)
    {
        return string.Equals(left, right, StringComparison.OrdinalIgnoreCase);
    }

    private static string UnknownChoiceMessage(SearchableField field, string value, IReadOnlyList<SearchChoice> options)
    {
        if (value.StartsWith('#'))
        {
            return $"That {field.DisplayName} choice no longer exists.";
        }

        var labels = string.Join(", ", options.Select(option => option.Label));
        return $"'{value}' is not a {field.DisplayName} choice. Choose one of: {labels}.";
    }

    private ValueOutcome Combine(SearchableField field, ValueOutcome low, ValueOutcome high)
    {
        var stable = $"{low.Stable}..{high.Stable}";
        var display = $"{low.Display}..{high.Display}";

        switch (low.Value, high.Value)
        {
            case (FilterValue.Number first, FilterValue.Number second) when first.Value <= second.Value:
                return ValueOutcome.Ok(new FilterValue.NumberRange(first.Value, second.Value), stable, display);

            case (FilterValue.Date first, FilterValue.Date second) when first.Value <= second.Value:
                return ValueOutcome.Ok(new FilterValue.DateRange(first.Value, second.Value), stable, display);

            case (FilterValue.Choice first, FilterValue.Choice second):
                return CombineChoices(field, first, second, stable, display);

            default:
                return ValueOutcome.Fail("The first value must not be after the second.");
        }
    }

    private ValueOutcome CombineChoices(SearchableField field, FilterValue.Choice first,
        FilterValue.Choice second, string stable, string display)
    {
        var options = OptionsFor(field);
        var firstRank = options.First(option => option.Id == first.Id).SortOrder;
        var secondRank = options.First(option => option.Id == second.Id).SortOrder;

        if (firstRank > secondRank)
        {
            return ValueOutcome.Fail("Put the more important choice first, like priority:high..low.");
        }

        return ValueOutcome.Ok(new FilterValue.ChoiceRange(first.Id, second.Id), stable, display);
    }
}