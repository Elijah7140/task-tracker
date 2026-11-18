using TaskTracker.Core.Fields;

namespace TaskTracker.Core.Search.Syntax;

/// <summary>
/// Matches scanned clauses to searchable fields and operators, recording an error for every
/// clause that cannot be turned into a valid <see cref="FieldFilter"/>.
/// </summary>
internal sealed class QueryClauseBinder
{
    private readonly IReadOnlyList<SearchableField> fields;
    private readonly QueryValueReader reader;
    private readonly List<QueryParseError> errors;

    public QueryClauseBinder(
        IReadOnlyList<SearchableField> fields, QueryValueReader reader, List<QueryParseError> errors)
    {
        this.fields = fields;
        this.reader = reader;
        this.errors = errors;
    }

    /// <summary>Returns the bound clause, or null after recording why the clause is invalid.</summary>
    public BoundClause? Bind(QueryClause clause)
    {
        var key = clause.Key.ToLowerInvariant();
        var isKeyword = clause.Symbol == ":" && BuiltInSearchKeys.QueryKeywords.Contains(key);

        if (isKeyword)
        {
            return BindKeyword(clause, key);
        }

        var field = FindField(key);

        if (field is null)
        {
            return Fail(clause, UnknownFieldMessage(clause.Key));
        }

        return BindField(clause, field);
    }

    private SearchableField? FindField(string key)
    {
        return fields.FirstOrDefault(field => field.Key == key);
    }

    private BoundClause? BindKeyword(QueryClause clause, string key)
    {
        if (clause.Endpoints.Count != 1)
        {
            return Fail(clause, $"'{key}:' takes one value.");
        }

        var value = clause.Endpoints[0].Value.Trim();
        return key == "is" ? BindIs(clause, value) : BindPresence(clause, key, value);
    }

    private BoundClause? BindIs(QueryClause clause, string value)
    {
        if (value.Equals("recurring", StringComparison.OrdinalIgnoreCase))
        {
            var repeats = new FieldFilter("repeats", FilterOperator.Equals, new FilterValue.Bool(true));
            return new BoundClause(repeats, "is:recurring", "is:recurring");
        }

        var wantsDone = value.Equals("done", StringComparison.OrdinalIgnoreCase)
            || value.Equals("completed", StringComparison.OrdinalIgnoreCase);

        if (!wantsDone && !value.Equals("open", StringComparison.OrdinalIgnoreCase))
        {
            return Fail(clause, "'is:' takes done, open or recurring.");
        }

        var filter = new FieldFilter("completed", FilterOperator.Equals, new FilterValue.Bool(wantsDone));
        var text = wantsDone ? "is:done" : "is:open";
        return new BoundClause(filter, text, text);
    }

    private BoundClause? BindPresence(QueryClause clause, string keyword, string fieldKey)
    {
        var field = FindField(fieldKey.ToLowerInvariant());

        if (field is null)
        {
            return Fail(clause, UnknownFieldMessage(fieldKey));
        }

        var operation = keyword == "has" ? FilterOperator.IsNotEmpty : FilterOperator.IsEmpty;
        var text = $"{keyword}:{field.Key}";
        return new BoundClause(new FieldFilter(field.Key, operation, null), text, text);
    }

    private BoundClause? BindField(QueryClause clause, SearchableField field)
    {
        var problem = FindShapeProblem(clause, field);

        if (problem is not null)
        {
            return Fail(clause, problem);
        }

        if (clause.Symbol is ">=" or "<=")
        {
            return BindInclusive(clause, field);
        }

        var outcome = ReadValue(clause, field);

        if (outcome.Error is not null)
        {
            return Fail(clause, outcome.Error);
        }

        return Bound(field, OperatorFor(clause), outcome.Value!, clause.Symbol, outcome);
    }

    private static string? FindShapeProblem(QueryClause clause, SearchableField field)
    {
        if (clause.Endpoints.Count > 2)
        {
            return "A range has two ends, like 1..5.";
        }

        if (clause.Endpoints.Count == 2 && clause.Symbol != ":")
        {
            return "Ranges like a..b go after ':' only.";
        }

        if (!SearchOperators.For(field).Contains(OperatorFor(clause)))
        {
            return $"{field.DisplayName} ('{field.Key}') does not support '{clause.Symbol}'. "
                + $"Use: {AllowedSymbols(field)}.";
        }

        return null;
    }

    private static FilterOperator OperatorFor(QueryClause clause)
    {
        return clause.Symbol switch
        {
            ":" => clause.Endpoints.Count == 2 ? FilterOperator.Between : FilterOperator.Equals,
            "!=" => FilterOperator.NotEquals,
            ">" or ">=" => FilterOperator.GreaterThan,
            "<" or "<=" => FilterOperator.LessThan,
            _ => FilterOperator.Contains
        };
    }

    private static string AllowedSymbols(SearchableField field)
    {
        var symbols = new List<string>();

        foreach (var operation in SearchOperators.For(field))
        {
            var symbol = QueryOperatorSymbols.Describe(operation);

            if (symbol is not null)
            {
                symbols.Add(symbol);
            }
        }

        return string.Join(", ", symbols);
    }

    private ValueOutcome ReadValue(QueryClause clause, SearchableField field)
    {
        if (clause.Endpoints.Count == 2)
        {
            return reader.ReadRange(field, clause.Endpoints[0], clause.Endpoints[1]);
        }

        return reader.Read(field, clause.Endpoints[0]);
    }

    private BoundClause? BindInclusive(QueryClause clause, SearchableField field)
    {
        if (field.DataType == FieldDataType.Date)
        {
            return BindInclusiveDate(clause, field);
        }

        if (field.IsBuiltIn && field.Key == "priority")
        {
            return BindInclusivePriority(clause, field);
        }

        return Fail(clause, "'>=' and '<=' work for dates and priority. "
            + "For other fields use '>' or '<', or a range like 3..5.");
    }

    /// <summary>Dates are whole days, so <c>due&gt;=D</c> is exactly <c>due&gt;D-1 day</c>.</summary>
    private BoundClause? BindInclusiveDate(QueryClause clause, SearchableField field)
    {
        var outcome = reader.Read(field, clause.Endpoints[0]);

        if (outcome.Error is not null)
        {
            return Fail(clause, outcome.Error);
        }

        var date = ((FilterValue.Date)outcome.Value!).Value;
        var isGreater = clause.Symbol == ">=";

        if (date == (isGreater ? DateOnly.MinValue : DateOnly.MaxValue))
        {
            var filter = new FieldFilter(field.Key, FilterOperator.IsNotEmpty, null);
            var text = $"{field.Key}{clause.Symbol}{outcome.Stable}";
            return new BoundClause(filter, text, text);
        }

        var edge = new FilterValue.Date(date.AddDays(isGreater ? -1 : 1));
        var operation = isGreater ? FilterOperator.GreaterThan : FilterOperator.LessThan;
        return Bound(field, operation, edge, clause.Symbol, outcome);
    }

    /// <summary>Priority is ranked, so <c>priority&gt;=high</c> is the range from the top level down to High.</summary>
    private BoundClause? BindInclusivePriority(QueryClause clause, SearchableField field)
    {
        var outcome = reader.Read(field, clause.Endpoints[0]);

        if (outcome.Error is not null)
        {
            return Fail(clause, outcome.Error);
        }

        var picked = ((FilterValue.Choice)outcome.Value!).Id;
        var ranked = reader.OptionsFor(field).OrderBy(option => option.SortOrder).ToList();
        var range = clause.Symbol == ">="
            ? new FilterValue.ChoiceRange(ranked[0].Id, picked)
            : new FilterValue.ChoiceRange(picked, ranked[^1].Id);

        return Bound(field, FilterOperator.Between, range, clause.Symbol, outcome);
    }

    private static BoundClause Bound(
        SearchableField field, FilterOperator operation, FilterValue value, string symbol, ValueOutcome written)
    {
        var filter = new FieldFilter(field.Key, operation, value);
        return new BoundClause(filter, $"{field.Key}{symbol}{written.Stable}", $"{field.Key}{symbol}{written.Display}");
    }

    private string UnknownFieldMessage(string typed)
    {
        var suggestion = QueryKeySuggester.Suggest(typed, fields.Select(field => field.Key));

        if (suggestion is not null)
        {
            return $"Unknown field '{typed}'. Did you mean '{suggestion}'?";
        }

        var known = string.Join(", ", fields.Select(field => field.Key));
        return $"Unknown field '{typed}'. Fields you can use: {known}.";
    }

    private BoundClause? Fail(QueryClause clause, string message)
    {
        errors.Add(new QueryParseError(clause.Start, clause.Length, message));
        return null;
    }
}