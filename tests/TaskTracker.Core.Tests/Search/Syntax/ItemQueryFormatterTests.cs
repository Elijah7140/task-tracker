using TaskTracker.Core.Search;
using TaskTracker.Core.Search.Syntax;

using static TaskTracker.Core.Tests.Search.Syntax.QuerySyntaxFixture;

namespace TaskTracker.Core.Tests.Search.Syntax;

public sealed class ItemQueryFormatterTests
{
    [Fact]
    public void Free_text_comes_first_then_one_clause_per_filter_with_choice_labels()
    {
        var parsed = Parse("due<2026-12-01 type:error \"deadlock\" priority:high");

        var text = ItemQueryFormatter.Format(parsed.Text, parsed.Filters, Choices);

        Assert.Equal("deadlock due<2026-12-01 type:Error priority:High", text);
    }

    [Theory]
    [InlineData("deadlock retry")]
    [InlineData("title:\"two words\" title~dead title!=x")]
    [InlineData("effort:1..5 effort>2.5 effort<10")]
    [InlineData("due:2026-11-01..2026-11-30 due>2026-11-01")]
    [InlineData("priority:high..low priority>medium priority<high")]
    [InlineData("type:\"needs review\" type!=error")]
    [InlineData("has:ticket no:due is:done")]
    [InlineData("is:open flagged:yes flagged!=no")]
    [InlineData("\"http://x\" \"a\\\"b\" title:\"a..b\"")]
    public void Formatting_a_parsed_query_is_stable_when_parsed_and_formatted_again(string source)
    {
        var first = Parse(source);
        var firstText = ItemQueryFormatter.Format(first.Text, first.Filters, Choices);

        var second = Parse(firstText);
        var secondText = ItemQueryFormatter.Format(second.Text, second.Filters, Choices);

        Assert.True(second.Succeeded, firstText);
        Assert.Equal(firstText, secondText);
        Assert.Equal(first.Filters, second.Filters);
        Assert.Equal(first.Text, second.Text);
    }

    [Fact]
    public void Inclusive_comparisons_are_written_in_their_exact_equivalent_form()
    {
        var priority = Parse("priority>=high");
        var date = Parse("due>=2026-12-01");

        Assert.Equal("priority:Critical..High",
            ItemQueryFormatter.Format(null, priority.Filters, Choices));
        Assert.Equal("due>2026-11-30", ItemQueryFormatter.Format(null, date.Filters, Choices));
    }

    [Fact]
    public void An_unknown_choice_id_is_written_with_a_hash_so_it_can_still_be_read_back()
    {
        var id = Guid.NewGuid();
        var filter = new FieldFilter("priority", FilterOperator.Equals, new FilterValue.Choice(id));

        var text = ItemQueryFormatter.Format(null, [filter], Choices);

        Assert.Equal($"priority:#{id:D}", text);
    }

    [Fact]
    public void Numbers_are_written_with_the_invariant_culture()
    {
        var filter = new FieldFilter("effort", FilterOperator.Equals, new FilterValue.Number(2.5));
        var previous = CultureInfoScope.Use("de-DE");

        var text = ItemQueryFormatter.Format(null, [filter], Choices);
        previous.Dispose();

        Assert.Equal("effort:2.5", text);
    }

    [Fact]
    public void Free_text_that_looks_like_syntax_is_quoted()
    {
        var text = ItemQueryFormatter.Format("has:ticket plain", [], Choices);

        Assert.Equal("\"has:ticket\" plain", text);
        Assert.Equal("has:ticket plain", Parse(text).Text);
    }
}