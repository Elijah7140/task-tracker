namespace TaskTracker.Core.Search.Syntax;

/// <summary>
/// Parses the text query syntax (<c>type:error priority&gt;=high due&lt;2026-12-01 "deadlock"</c>)
/// into free text and field filters. User mistakes become <see cref="QueryParseError"/>s with
/// positions, never exceptions. The grammar is documented in PLAN section 7.7.
/// </summary>
public sealed class ItemQueryParser
{
    private readonly TimeProvider clock;
    private readonly TimeZoneInfo timeZone;

    /// <summary>Relative dates (<c>today</c>, <c>+3d</c>) are resolved with this clock and zone.</summary>
    public ItemQueryParser(TimeProvider clock, TimeZoneInfo timeZone)
    {
        this.clock = clock;
        this.timeZone = timeZone;
    }

    /// <summary>
    /// Parses <paramref name="text"/> against the fields visible in the current scope.
    /// <paramref name="choices"/> lists the choices of each choice field by field key; fields
    /// missing from it have no choices.
    /// </summary>
    public QueryParseResult Parse(
        string? text,
        IReadOnlyList<SearchableField> fields,
        IReadOnlyDictionary<string, IReadOnlyList<SearchChoice>> choices)
    {
        var scan = new QueryScanner(text ?? string.Empty).Scan();
        var errors = new List<QueryParseError>(scan.Errors);
        var bound = BindClauses(scan.Clauses, fields, choices, errors);

        if (errors.Count > 0)
        {
            return QueryParseResult.Failure(errors.OrderBy(error => error.Position).ToList());
        }

        return CreateResult(scan.Words, bound);
    }

    /// <summary>The lower-case keys written in <paramref name="text"/>, so callers can load only the choices needed.</summary>
    public static IReadOnlyList<string> ClauseKeys(string? text)
    {
        var scan = new QueryScanner(text ?? string.Empty).Scan();
        return scan.Clauses.Select(clause => clause.Key.ToLowerInvariant()).Distinct().ToList();
    }

    private List<BoundClause> BindClauses(
        IReadOnlyList<QueryClause> clauses,
        IReadOnlyList<SearchableField> fields,
        IReadOnlyDictionary<string, IReadOnlyList<SearchChoice>> choices,
        List<QueryParseError> errors)
    {
        var reader = new QueryValueReader(new QueryDates(Today()), choices);
        var binder = new QueryClauseBinder(fields, reader, errors);
        var bound = new List<BoundClause>();

        foreach (var clause in clauses)
        {
            var result = binder.Bind(clause);

            if (result is not null)
            {
                bound.Add(result);
            }
        }

        return bound;
    }

    private DateOnly Today()
    {
        var local = TimeZoneInfo.ConvertTime(clock.GetUtcNow(), timeZone);
        return DateOnly.FromDateTime(local.DateTime);
    }

    private static QueryParseResult CreateResult(IReadOnlyList<string> words, List<BoundClause> bound)
    {
        var filters = bound.Select(clause => clause.Filter).ToList();
        var text = words.Count == 0 ? null : string.Join(' ', words);
        var quotedWords = words.Select(QueryQuoting.QuoteIfNeeded).ToList();
        var stable = string.Join(' ', quotedWords.Concat(bound.Select(clause => clause.StableText)));
        var display = string.Join(' ', quotedWords.Concat(bound.Select(clause => clause.DisplayText)));

        return new QueryParseResult(text, filters, stable, display, ImpliesCompleted(filters), []);
    }

    private static bool ImpliesCompleted(IReadOnlyList<FieldFilter> filters)
    {
        return filters.Any(filter => filter.FieldKey == "completed"
            && filter.Operator == FilterOperator.Equals
            && filter.Value is FilterValue.Bool { Value: true });
    }
}