using System.Globalization;

namespace TaskTracker.Core.Search.Syntax;

/// <summary>
/// Writes free text and filters as canonical query text: free text first, then one clause per
/// filter, with choices shown by label. <c>Parse(Format(x))</c> gives back the same filters.
/// </summary>
public static class ItemQueryFormatter
{
    /// <summary>
    /// Formats the query. <paramref name="choices"/> maps a choice field's key to its choices so
    /// ids can be shown as labels; an id with no match is written as <c>#id</c>.
    /// </summary>
    public static string Format(
        string? text,
        IReadOnlyList<FieldFilter> filters,
        IReadOnlyDictionary<string, IReadOnlyList<SearchChoice>> choices)
    {
        var parts = new List<string>();
        AddWords(parts, text);

        foreach (var filter in filters)
        {
            parts.Add(FormatFilter(filter, choices));
        }

        return string.Join(' ', parts);
    }

    private static void AddWords(List<string> parts, string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        var words = text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        parts.AddRange(words.Select(QueryQuoting.QuoteIfNeeded));
    }

    private static string FormatFilter(
        FieldFilter filter, IReadOnlyDictionary<string, IReadOnlyList<SearchChoice>> choices)
    {
        if (filter.Operator == FilterOperator.IsEmpty)
        {
            return $"no:{filter.FieldKey}";
        }

        if (filter.Operator == FilterOperator.IsNotEmpty)
        {
            return $"has:{filter.FieldKey}";
        }

        if (filter is { FieldKey: "repeats", Operator: FilterOperator.Equals, Value: FilterValue.Bool { Value: true } })
        {
            return "is:recurring";
        }

        if (filter is { FieldKey: "completed", Operator: FilterOperator.Equals, Value: FilterValue.Bool done })
        {
            return done.Value ? "is:done" : "is:open";
        }

        var symbol = QueryOperatorSymbols.Symbol(filter.Operator);
        return $"{filter.FieldKey}{symbol}{FormatValue(filter, choices)}";
    }

    private static string FormatValue(
        FieldFilter filter, IReadOnlyDictionary<string, IReadOnlyList<SearchChoice>> choices)
    {
        return filter.Value switch
        {
            FilterValue.Text text => QueryQuoting.QuoteIfNeeded(text.Value),
            FilterValue.Number number => FormatNumber(number.Value),
            FilterValue.Date date => FormatDate(date.Value),
            FilterValue.Bool flag => flag.Value ? "yes" : "no",
            FilterValue.Choice choice => FormatChoice(filter.FieldKey, choice.Id, choices),
            FilterValue.NumberRange range => $"{FormatNumber(range.Min)}..{FormatNumber(range.Max)}",
            FilterValue.DateRange range => $"{FormatDate(range.Min)}..{FormatDate(range.Max)}",
            FilterValue.ChoiceRange range => FormatChoiceRange(filter.FieldKey, range, choices),
            _ => string.Empty
        };
    }

    private static string FormatNumber(double value)
    {
        return value.ToString("R", CultureInfo.InvariantCulture);
    }

    private static string FormatDate(DateOnly value)
    {
        return value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }

    private static string FormatChoiceRange(
        string fieldKey, FilterValue.ChoiceRange range, IReadOnlyDictionary<string, IReadOnlyList<SearchChoice>> choices)
    {
        return $"{FormatChoice(fieldKey, range.Min, choices)}..{FormatChoice(fieldKey, range.Max, choices)}";
    }

    private static string FormatChoice(
        string fieldKey, Guid id, IReadOnlyDictionary<string, IReadOnlyList<SearchChoice>> choices)
    {
        if (choices.TryGetValue(fieldKey, out var options))
        {
            var match = options.FirstOrDefault(option => option.Id == id);

            if (match is not null)
            {
                return QueryQuoting.FormatChoice(match, fieldKey);
            }
        }

        return $"#{id:D}";
    }
}