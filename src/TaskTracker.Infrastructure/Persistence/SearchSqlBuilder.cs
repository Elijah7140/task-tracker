using System.Data.Common;
using System.Globalization;
using System.Text;

using TaskTracker.Core.Fields;
using TaskTracker.Core.Search;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>Composes a validated search as one bounded SQLite statement.</summary>
internal sealed class SearchSqlBuilder(DbCommand command, ItemQuery query,
    IReadOnlyList<SearchableField> fields, int limit)
{
    private readonly List<string> conditions = [];

    private int parameterIndex;

    public string Build()
    {
        AddVisibility();
        AddScope();
        AddText();
        AddFilters();
        var hasText = FtsTermBuilder.Build(query.Text) is not null;
        var sql = SelectAndJoin(hasText);
        sql.Append("WHERE ").Append(string.Join(" AND ", conditions));
        AppendOrderAndLimit(sql, hasText);
        return sql.ToString();
    }

    private static StringBuilder SelectAndJoin(bool hasText)
    {
        var sql = new StringBuilder("SELECT t.Id, t.ProjectId, p.Name, t.FolderId, t.ParentItemId, "
            + "t.Title, t.TicketNumber, t.ItemTypeId, t.PriorityLevelId, t.DueDate, t.DueTime, "
            + "CASE WHEN t.CompletedAtUtc IS NULL THEN 0 ELSE 1 END, t.ScheduledStart IS NOT NULL, t.StatusId "
            + "FROM TodoItem t JOIN Project p ON p.Id = t.ProjectId ");

        if (hasText)
        {
            sql.Append("JOIN TodoItemSearchRow mapping ON mapping.ItemId = t.Id "
                + "JOIN TodoItemSearch ON TodoItemSearch.rowid = mapping.RowId ");
        }

        return sql;
    }

    private void AppendOrderAndLimit(StringBuilder sql, bool hasText)
    {
        sql.Append(" ORDER BY ");

        if (hasText)
        {
            sql.Append("bm25(TodoItemSearch), ");
        }

        sql.Append("p.SortOrder, tt_fold(t.Title), t.Id LIMIT ");
        sql.Append(Parameter(limit == int.MaxValue ? limit : limit + 1));
    }

    private void AddVisibility()
    {
        conditions.Add("t.DeletedAtUtc IS NULL");
        conditions.Add("p.DeletedAtUtc IS NULL");
        conditions.Add("(t.FolderId IS NULL OR EXISTS (SELECT 1 FROM Folder folder "
            + "WHERE folder.Id = t.FolderId AND folder.DeletedAtUtc IS NULL))");

        if (!query.IncludeCompleted)
        {
            conditions.Add("t.CompletedAtUtc IS NULL");
        }
    }

    private void AddScope()
    {
        if (query.Scope is SearchScope.AllProjects)
        {
            return;
        }

        var projectId = query.Scope is SearchScope.Project project
            ? project.ProjectId : ((SearchScope.Area)query.Scope).ProjectId;
        conditions.Add($"t.ProjectId = {Parameter(projectId)}");

        if (query.Scope is SearchScope.Area area)
        {
            AddArea(area);
        }
    }

    private void AddArea(SearchScope.Area area)
    {
        if (area.FolderId is null)
        {
            if (!area.IncludeSubfolders)
            {
                conditions.Add("t.FolderId IS NULL");
            }

            return;
        }

        var folderId = Parameter(area.FolderId.Value);

        if (!area.IncludeSubfolders)
        {
            conditions.Add($"t.FolderId = {folderId}");
            return;
        }

        conditions.Add("t.FolderId IN (WITH RECURSIVE descendants(Id) AS ("
            + $"SELECT {folderId} UNION ALL SELECT child.Id FROM Folder child "
            + "JOIN descendants parent ON child.ParentFolderId = parent.Id "
            + "WHERE child.DeletedAtUtc IS NULL) SELECT Id FROM descendants)");
    }

    private void AddText()
    {
        var match = FtsTermBuilder.Build(query.Text);

        if (match is not null)
        {
            conditions.Add($"TodoItemSearch MATCH {Parameter(match)}");
        }
    }

    private void AddFilters()
    {
        foreach (var filter in query.Filters)
        {
            var field = fields.First(candidate => candidate.Key == filter.FieldKey);
            conditions.Add(field.IsBuiltIn
                ? BuiltInFilter(filter) : CustomFilter(field.FieldDefinitionId!.Value, field.DataType, filter));
        }
    }

    private string BuiltInFilter(FieldFilter filter)
    {
        return filter.FieldKey switch
        {
            "title" => TextFilter("t.Title", filter),
            "ticket" => TextFilter("t.TicketNumber", filter),
            "type" => ScalarFilter("t.ItemTypeId", filter),
            "priority" => PriorityFilter(filter),
            "due" => ScalarFilter("t.DueDate", filter),
            "scheduled" => ScalarFilter("substr(t.ScheduledStart, 1, 10)", filter,
                "t.ScheduledStart"),
            "completed" => BooleanColumnFilter(filter, "t.CompletedAtUtc"),
            "status" => TextFilter("(SELECT s.Name FROM StatusLevel s WHERE s.Id = t.StatusId)", filter),
            "repeats" => BooleanColumnFilter(filter, "t.RecurrenceFrequency"),
            "link" => LinkFilter(filter),
            "reminder" => filter.Operator == FilterOperator.IsNotEmpty
                ? $"({ReminderSql.Eligible})" : $"NOT ({ReminderSql.Eligible})",
            _ => throw new InvalidOperationException("Unknown built-in search field.")
        };
    }

    /// <summary>Matches items having a link whose address or title contains the text (case-insensitive, literal).</summary>
    private string LinkFilter(FieldFilter filter)
    {
        if (filter.Operator is FilterOperator.IsEmpty)
        {
            return "NOT EXISTS (SELECT 1 FROM ItemLink l WHERE l.ItemId = t.Id)";
        }

        if (filter.Operator is FilterOperator.IsNotEmpty)
        {
            return "EXISTS (SELECT 1 FROM ItemLink l WHERE l.ItemId = t.Id)";
        }

        var text = TextFolding.Fold(((FilterValue.Text)filter.Value!).Value.Trim());
        var parameter = Parameter(text);
        return "EXISTS (SELECT 1 FROM ItemLink l WHERE l.ItemId = t.Id AND "
            + $"(instr(tt_fold(l.Url), {parameter}) > 0 OR instr(tt_fold(COALESCE(l.Title, '')), {parameter}) > 0))";
    }

    private string CustomFilter(Guid fieldId, FieldDataType type, FieldFilter filter)
    {
        var fieldParameter = Parameter(fieldId);
        var baseWhere = $"v.ItemId = t.Id AND v.FieldDefinitionId = {fieldParameter}";

        if (filter.Operator is FilterOperator.IsEmpty)
        {
            return $"NOT EXISTS (SELECT 1 FROM ItemFieldValue v WHERE {baseWhere})";
        }

        if (filter.Operator is FilterOperator.IsNotEmpty)
        {
            return $"EXISTS (SELECT 1 FROM ItemFieldValue v WHERE {baseWhere})";
        }

        var column = CustomColumn(type);
        var comparison = type == FieldDataType.Text
            ? TextFilter(column, filter) : ScalarFilter(column, filter);
        return $"EXISTS (SELECT 1 FROM ItemFieldValue v WHERE {baseWhere} AND {comparison})";
    }

    private static string CustomColumn(FieldDataType type)
    {
        return type switch
        {
            FieldDataType.Text => "v.TextValue",
            FieldDataType.Number => "v.NumberValue",
            FieldDataType.Date => "v.DateValue",
            FieldDataType.Boolean => "v.BoolValue",
            FieldDataType.Choice => "v.ChoiceId",
            _ => throw new InvalidOperationException("Unknown custom field type.")
        };
    }

    private string TextFilter(string column, FieldFilter filter)
    {
        if (filter.Operator is FilterOperator.IsEmpty)
        {
            return $"{column} IS NULL";
        }

        if (filter.Operator is FilterOperator.IsNotEmpty)
        {
            return $"{column} IS NOT NULL";
        }

        var text = TextFolding.Fold(((FilterValue.Text)filter.Value!).Value.Trim());
        var parameter = Parameter(text);
        var folded = $"tt_fold({column})";
        return filter.Operator switch
        {
            FilterOperator.Equals => $"{column} IS NOT NULL AND {folded} = {parameter}",
            FilterOperator.NotEquals => $"{column} IS NOT NULL AND {folded} <> {parameter}",
            _ => $"{column} IS NOT NULL AND instr({folded}, {parameter}) > 0"
        };
    }

    private string ScalarFilter(string column, FieldFilter filter, string? presenceColumn = null)
    {
        var present = presenceColumn ?? column;

        if (filter.Operator is FilterOperator.IsEmpty)
        {
            return $"{present} IS NULL";
        }

        if (filter.Operator is FilterOperator.IsNotEmpty)
        {
            return $"{present} IS NOT NULL";
        }

        if (filter.Operator is FilterOperator.Between)
        {
            return BetweenFilter(column, filter.Value!);
        }

        return ScalarComparison(column, present, filter);
    }

    private string ScalarComparison(string column, string present, FieldFilter filter)
    {
        var parameter = Parameter(ScalarValue(filter.Value!));
        var comparison = filter.Operator switch
        {
            FilterOperator.Equals => "=",
            FilterOperator.NotEquals => "<>",
            FilterOperator.GreaterThan => ">",
            _ => "<"
        };
        return $"{present} IS NOT NULL AND {column} {comparison} {parameter}";
    }

    private string BetweenFilter(string column, FilterValue value)
    {
        object minimum;
        object maximum;

        if (value is FilterValue.NumberRange numbers)
        {
            minimum = numbers.Min;
            maximum = numbers.Max;
        }
        else if (value is FilterValue.DateRange dates)
        {
            minimum = DateText(dates.Min);
            maximum = DateText(dates.Max);
        }
        else
        {
            throw new InvalidOperationException("Invalid range value.");
        }

        return $"{column} BETWEEN {Parameter(minimum)} AND {Parameter(maximum)}";
    }

    private string PriorityFilter(FieldFilter filter)
    {
        if (filter.Operator is FilterOperator.IsEmpty or FilterOperator.IsNotEmpty
            or FilterOperator.Equals or FilterOperator.NotEquals)
        {
            return ScalarFilter("t.PriorityLevelId", filter);
        }

        var actual = "(SELECT SortOrder FROM PriorityLevel WHERE Id = t.PriorityLevelId)";

        if (filter.Value is FilterValue.ChoiceRange range)
        {
            var minimum = RankOf(Parameter(range.Min));
            var maximum = RankOf(Parameter(range.Max));
            return $"t.PriorityLevelId IS NOT NULL AND {actual} BETWEEN {minimum} AND {maximum}";
        }

        var choice = (FilterValue.Choice)filter.Value!;
        var bound = RankOf(Parameter(choice.Id));
        var comparison = filter.Operator is FilterOperator.GreaterThan ? "<" : ">";
        return $"t.PriorityLevelId IS NOT NULL AND {actual} {comparison} {bound}";
    }

    private static string RankOf(string parameter)
    {
        return $"(SELECT SortOrder FROM PriorityLevel WHERE Id = {parameter})";
    }

    private static string BooleanColumnFilter(FieldFilter filter, string column)
    {
        if (filter.Operator is FilterOperator.IsEmpty)
        {
            return "0 = 1";
        }

        if (filter.Operator is FilterOperator.IsNotEmpty)
        {
            return "1 = 1";
        }

        var value = ((FilterValue.Bool)filter.Value!).Value;
        var matchesPresent = filter.Operator is FilterOperator.Equals ? value : !value;
        return matchesPresent ? $"{column} IS NOT NULL" : $"{column} IS NULL";
    }

    private static object ScalarValue(FilterValue value)
    {
        return value switch
        {
            FilterValue.Number number => number.Value,
            FilterValue.Date date => DateText(date.Value),
            FilterValue.Bool boolean => boolean.Value,
            FilterValue.Choice choice => choice.Id,
            _ => throw new InvalidOperationException("Invalid scalar value.")
        };
    }

    private static string DateText(DateOnly date)
    {
        return date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }

    private string Parameter(object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = $"@p{parameterIndex++}";
        parameter.Value = value;
        command.Parameters.Add(parameter);
        return parameter.ParameterName;
    }
}