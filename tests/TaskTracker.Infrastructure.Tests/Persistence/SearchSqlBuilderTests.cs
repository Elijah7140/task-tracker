using Microsoft.Data.Sqlite;

using TaskTracker.Core.Fields;
using TaskTracker.Core.Search;
using TaskTracker.Infrastructure.Persistence;

namespace TaskTracker.Infrastructure.Tests.Persistence;

public sealed class SearchSqlBuilderTests
{
    [Fact]
    public void Blank_search_selects_only_result_columns_and_limits_sql_rows()
    {
        using var connection = new SqliteConnection("Data Source=:memory:");
        using var command = connection.CreateCommand();
        var query = new ItemQuery(new SearchScope.AllProjects(), null, [], true);

        var sql = new SearchSqlBuilder(command, query, [], 200).Build();

        Assert.StartsWith("SELECT t.Id, t.ProjectId, p.Name", sql);
        Assert.DoesNotContain("t.Description", sql);
        Assert.Contains("ORDER BY p.SortOrder, tt_fold(t.Title), t.Id LIMIT", sql);
        Assert.Equal(201L, Convert.ToInt64(command.Parameters[^1].Value));
    }

    [Fact]
    public void Text_and_custom_filters_join_and_order_before_sql_limit()
    {
        using var connection = new SqliteConnection("Data Source=:memory:");
        using var command = connection.CreateCommand();
        var fieldId = Guid.CreateVersion7();
        var fields = new[] { new SearchableField("note", "Note", FieldDataType.Text, fieldId) };
        var filter = new FieldFilter("note", FilterOperator.Contains, new FilterValue.Text("50%_"));
        var query = new ItemQuery(new SearchScope.AllProjects(), "needle", [filter], true);

        var sql = new SearchSqlBuilder(command, query, fields, 2).Build();

        Assert.Contains("JOIN TodoItemSearchRow mapping", sql);
        Assert.Contains("TodoItemSearch MATCH", sql);
        Assert.Contains("EXISTS (SELECT 1 FROM ItemFieldValue", sql);
        Assert.Contains("instr(tt_fold(v.TextValue)", sql);
        Assert.Contains("ORDER BY bm25(TodoItemSearch), p.SortOrder", sql);
        Assert.EndsWith($"LIMIT {command.Parameters[^1].ParameterName}", sql);
        Assert.Equal(3L, Convert.ToInt64(command.Parameters[^1].Value));
        Assert.Contains(command.Parameters.Cast<SqliteParameter>(), parameter =>
            Equals(parameter.Value, "50%_"));
    }
}