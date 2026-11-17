using TaskTracker.Core.Search;
using TaskTracker.Core.Search.Syntax;

using static TaskTracker.Core.Tests.Search.Syntax.QuerySyntaxFixture;

namespace TaskTracker.Core.Tests.Search.Syntax;

public sealed class StableQueryTextTests
{
    [Fact]
    public void Choices_are_stored_as_ids_and_relative_dates_stay_relative()
    {
        var result = Parse("deadlock priority:high due<today type:\"needs review\"");

        Assert.Equal(
            $"deadlock priority:#{High:D} due<today type:#{NeedsReview:D}", result.StableText);
    }

    [Fact]
    public void Display_text_shows_choice_labels_keeps_relative_dates_and_parses_back_to_the_same_filters()
    {
        var original = Parse("deadlock priority:#" + High.ToString("D") + " due<today type:\"needs review\"");

        var again = Parse(original.DisplayText);

        Assert.Equal("deadlock priority:High due<today type:\"Needs review\"", original.DisplayText);
        Assert.Equal(original.Filters, again.Filters);
    }

    [Fact]
    public void Stable_text_parses_to_the_same_filters_as_the_original()
    {
        var original = Parse("priority>=high type:error effort:1..5 is:done no:ticket");

        var again = Parse(original.StableText);

        Assert.True(again.Succeeded, original.StableText);
        Assert.Equal(original.Filters, again.Filters);
        Assert.Equal(original.Text, again.Text);
    }

    [Fact]
    public void Renaming_a_choice_label_does_not_break_stable_text()
    {
        var original = Parse("priority:high");
        var renamed = new Dictionary<string, IReadOnlyList<SearchChoice>>(Choices)
        {
            ["priority"] =
            [
                new(Critical, "Blocker", 0), new(High, "Urgent", 1), new(Medium, "Medium", 2), new(Low, "Low", 3)
            ]
        };

        var again = Parser().Parse(original.StableText, SearchFields, renamed);

        Assert.True(again.Succeeded);
        Assert.Equal(new FilterValue.Choice(High), Assert.Single(again.Filters).Value);
        Assert.False(Parser().Parse("priority:high", SearchFields, renamed).Succeeded);
    }

    [Fact]
    public void A_choice_removed_after_saving_is_reported_not_thrown()
    {
        var original = Parse("type:error");
        var withoutError = new Dictionary<string, IReadOnlyList<SearchChoice>>(Choices)
        {
            ["type"] = [new(NeedsReview, "Needs review", 1)]
        };

        var again = Parser().Parse(original.StableText, SearchFields, withoutError);

        Assert.Contains("no longer exists", Assert.Single(again.Errors).Message);
    }

    [Fact]
    public void A_field_removed_after_saving_is_reported_as_unknown()
    {
        var original = Parse("effort:3");
        var withoutEffort = SearchFields.Where(field => field.Key != "effort").ToList();

        var again = Parser().Parse(original.StableText, withoutEffort, Choices);

        Assert.Contains("Unknown field 'effort'", Assert.Single(again.Errors).Message);
    }
}