using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Search;
using TaskTracker.Core.Search.Syntax;

using static TaskTracker.Core.Tests.Search.Syntax.QuerySyntaxFixture;

namespace TaskTracker.Core.Tests.Search.Syntax;

public sealed class ItemQueryParserTests
{
    [Fact]
    public void Plain_words_and_quoted_phrases_become_free_text()
    {
        var result = Parse("deadlock \"in the billing job\" retry");

        Assert.True(result.Succeeded);
        Assert.Equal("deadlock in the billing job retry", result.Text);
        Assert.Empty(result.Filters);
    }

    [Fact]
    public void Empty_text_parses_to_no_text_and_no_filters()
    {
        var result = Parse("   ");

        Assert.True(result.Succeeded);
        Assert.Null(result.Text);
        Assert.Empty(result.Filters);
    }

    [Fact]
    public void Colon_means_equals_for_text()
    {
        var result = Parse("ticket:JIRA-12");

        Assert.Equal(new FieldFilter("ticket", FilterOperator.Equals, new FilterValue.Text("JIRA-12")),
            Assert.Single(result.Filters));
    }

    [Fact]
    public void Quoted_values_may_hold_spaces_and_escaped_quotes()
    {
        var result = Parse("title:\"say \\\"hi\\\" now\"");

        Assert.Equal(new FilterValue.Text("say \"hi\" now"), Assert.Single(result.Filters).Value);
    }

    [Fact]
    public void Keys_are_not_case_sensitive()
    {
        var result = Parse("TYPE:error");

        Assert.Equal("type", Assert.Single(result.Filters).FieldKey);
    }

    [Theory]
    [InlineData("title!=draft", FilterOperator.NotEquals)]
    [InlineData("title~dead", FilterOperator.Contains)]
    [InlineData("effort>3", FilterOperator.GreaterThan)]
    [InlineData("effort<3", FilterOperator.LessThan)]
    public void Operator_symbols_map_to_filter_operators(string text, FilterOperator expected)
    {
        var result = Parse(text);

        Assert.True(result.Succeeded);
        Assert.Equal(expected, Assert.Single(result.Filters).Operator);
    }

    [Fact]
    public void Numbers_use_the_invariant_culture()
    {
        var result = Parse("effort:2.5");

        Assert.Equal(new FilterValue.Number(2.5), Assert.Single(result.Filters).Value);
    }

    [Fact]
    public void A_decimal_comma_is_rejected_as_not_a_number()
    {
        var result = Parse("effort:2,5");

        Assert.Contains("not a number", Assert.Single(result.Errors).Message);
    }

    [Theory]
    [InlineData("yes", true)]
    [InlineData("TRUE", true)]
    [InlineData("no", false)]
    [InlineData("false", false)]
    public void Booleans_accept_yes_no_true_false(string word, bool expected)
    {
        var result = Parse($"flagged:{word}");

        Assert.Equal(new FilterValue.Bool(expected), Assert.Single(result.Filters).Value);
    }

    [Fact]
    public void Choices_resolve_by_label_ignoring_case()
    {
        var result = Parse("priority:high type:\"needs REVIEW\"");

        Assert.Equal(new FilterValue.Choice(High), result.Filters[0].Value);
        Assert.Equal(new FilterValue.Choice(NeedsReview), result.Filters[1].Value);
    }

    [Fact]
    public void Choices_resolve_by_id_when_written_with_a_hash()
    {
        var result = Parse($"priority:#{Medium:D}");

        Assert.Equal(new FilterValue.Choice(Medium), Assert.Single(result.Filters).Value);
    }

    [Fact]
    public void Quoted_id_shaped_choice_label_resolves_by_label()
    {
        var label = $"#{Medium:D}";
        var choices = new Dictionary<string, IReadOnlyList<SearchChoice>>(Choices);
        choices["priority"] = Choices["priority"]
            .Select(choice => choice.Id == High ? choice with { Label = label } : choice)
            .ToList();
        var parser = new ItemQueryParser(new FakeTimeProvider(new DateTimeOffset(2026, 11, 13, 12, 0, 0, TimeSpan.Zero)),
            TimeZoneInfo.Utc);

        var parsed = parser.Parse($"priority:\"{label}\"", SearchFields, choices);
        var display = parsed.DisplayText;
        var reparsed = parser.Parse(display, SearchFields, choices);
        var formatted = ItemQueryFormatter.Format(null, parsed.Filters, choices);

        Assert.Equal(new FilterValue.Choice(High), Assert.Single(parsed.Filters).Value);
        Assert.Equal($"priority:\"{label}\"", display);
        Assert.Equal(display, formatted);
        Assert.Equal(parsed.Filters, reparsed.Filters);
    }

    [Fact]
    public void A_choice_id_that_no_longer_exists_is_an_error()
    {
        var result = Parse($"priority:#{Guid.NewGuid():D}");

        Assert.Contains("no longer exists", Assert.Single(result.Errors).Message);
    }

    [Fact]
    public void An_unknown_choice_label_lists_the_choices()
    {
        var result = Parse("priority:urgent");

        var message = Assert.Single(result.Errors).Message;
        Assert.Contains("'urgent' is not a Priority choice", message);
        Assert.Contains("Critical, High, Medium, Low", message);
    }

    [Fact]
    public void Greater_than_on_priority_means_more_important()
    {
        var result = Parse("priority>high");

        Assert.Equal(new FieldFilter("priority", FilterOperator.GreaterThan, new FilterValue.Choice(High)),
            Assert.Single(result.Filters));
    }

    [Fact]
    public void Priority_at_least_high_is_the_range_from_the_top_level_to_high()
    {
        var result = Parse("priority>=high");

        Assert.Equal(new FieldFilter("priority", FilterOperator.Between, new FilterValue.ChoiceRange(Critical, High)),
            Assert.Single(result.Filters));
    }

    [Fact]
    public void Priority_at_most_high_is_the_range_from_high_to_the_bottom_level()
    {
        var result = Parse("priority<=high");

        Assert.Equal(new FieldFilter("priority", FilterOperator.Between, new FilterValue.ChoiceRange(High, Low)),
            Assert.Single(result.Filters));
    }

    [Fact]
    public void Priority_range_runs_from_more_important_to_less_important()
    {
        var forward = Parse("priority:high..low");
        var backward = Parse("priority:low..high");

        Assert.Equal(new FilterValue.ChoiceRange(High, Low), Assert.Single(forward.Filters).Value);
        Assert.Contains("more important", Assert.Single(backward.Errors).Message);
    }

    [Fact]
    public void Dates_accept_iso_text()
    {
        var result = Parse("due<2026-12-01");

        Assert.Equal(new FieldFilter("due", FilterOperator.LessThan, new FilterValue.Date(new DateOnly(2026, 12, 1))),
            Assert.Single(result.Filters));
    }

    [Theory]
    [InlineData("today", 2026, 11, 13)]
    [InlineData("tomorrow", 2026, 11, 14)]
    [InlineData("yesterday", 2026, 11, 12)]
    [InlineData("+3d", 2026, 11, 16)]
    [InlineData("-1w", 2026, 11, 6)]
    [InlineData("+0d", 2026, 11, 13)]
    [InlineData("TODAY", 2026, 11, 13)]
    public void Dates_accept_relative_words_and_offsets(string word, int year, int month, int day)
    {
        var result = Parse($"due:{word}");

        Assert.Equal(new FilterValue.Date(new DateOnly(year, month, day)), Assert.Single(result.Filters).Value);
    }

    [Fact]
    public void Relative_dates_use_the_zone_passed_in_not_the_machine_zone()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 11, 13, 20, 0, 0, TimeSpan.Zero));
        var sydney = TimeZoneInfo.FindSystemTimeZoneById(
            OperatingSystem.IsWindows() ? "AUS Eastern Standard Time" : "Australia/Sydney");
        var parser = new ItemQueryParser(clock, sydney);

        var result = parser.Parse("due:today", SearchFields, Choices);

        Assert.Equal(new FilterValue.Date(new DateOnly(2026, 11, 14)), Assert.Single(result.Filters).Value);
    }

    [Fact]
    public void Bad_dates_explain_the_accepted_spellings()
    {
        var result = Parse("due:soon");

        Assert.Contains("yyyy-MM-dd", Assert.Single(result.Errors).Message);
    }

    [Fact]
    public void Date_at_or_after_is_translated_to_greater_than_the_day_before()
    {
        var after = Parse("due>=2026-12-01");
        var before = Parse("due<=2026-12-01");

        Assert.Equal(new FieldFilter("due", FilterOperator.GreaterThan, new FilterValue.Date(new DateOnly(2026, 11, 30))),
            Assert.Single(after.Filters));
        Assert.Equal(new FieldFilter("due", FilterOperator.LessThan, new FilterValue.Date(new DateOnly(2026, 12, 2))),
            Assert.Single(before.Filters));
    }

    [Theory]
    [InlineData("due>=0001-01-01")]
    [InlineData("due<=9999-12-31")]
    public void Inclusive_date_at_the_domain_edge_means_a_nonempty_date(string query)
    {
        var result = Parse(query);

        Assert.True(result.Succeeded);
        Assert.Equal(new FieldFilter("due", FilterOperator.IsNotEmpty, null), Assert.Single(result.Filters));
    }

    [Theory]
    [InlineData(1, 1, 1, "yesterday")]
    [InlineData(1, 1, 1, "-5000w")]
    [InlineData(9999, 12, 31, "tomorrow")]
    [InlineData(9999, 12, 31, "+5000w")]
    public void Relative_date_outside_the_domain_is_a_parse_error(int year, int month, int day, string value)
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(year, month, day, 12, 0, 0, TimeSpan.Zero));
        var parser = new ItemQueryParser(clock, TimeZoneInfo.Utc);

        var result = parser.Parse($"due:{value}", SearchFields, Choices);

        Assert.False(result.Succeeded);
        Assert.Contains("not a date", Assert.Single(result.Errors).Message);
    }

    [Fact]
    public void Inclusive_comparison_is_rejected_for_numbers_with_a_hint()
    {
        var result = Parse("effort>=3");

        Assert.Contains("work for dates and priority", Assert.Single(result.Errors).Message);
    }

    [Fact]
    public void Number_and_date_ranges_are_inclusive_between_filters()
    {
        var numbers = Parse("effort:1..5");
        var dates = Parse("due:2026-11-01..today");

        Assert.Equal(new FilterValue.NumberRange(1, 5), Assert.Single(numbers.Filters).Value);
        Assert.Equal(new FilterValue.DateRange(new DateOnly(2026, 11, 1), new DateOnly(2026, 11, 13)),
            Assert.Single(dates.Filters).Value);
        Assert.Equal(FilterOperator.Between, dates.Filters[0].Operator);
    }

    [Fact]
    public void A_backwards_range_is_an_error()
    {
        var result = Parse("effort:5..1");

        Assert.Contains("must not be after", Assert.Single(result.Errors).Message);
    }

    [Fact]
    public void Ranges_go_after_the_colon_only()
    {
        var result = Parse("effort>1..5");

        Assert.Contains("after ':' only", Assert.Single(result.Errors).Message);
    }

    [Fact]
    public void Has_and_no_map_to_presence_filters()
    {
        var result = Parse("has:ticket no:effort");

        Assert.Equal(new FieldFilter("ticket", FilterOperator.IsNotEmpty, null), result.Filters[0]);
        Assert.Equal(new FieldFilter("effort", FilterOperator.IsEmpty, null), result.Filters[1]);
    }

    [Fact]
    public void Is_done_and_is_open_map_to_the_status_field_and_done_includes_completed()
    {
        var done = Parse("is:done");
        var open = Parse("is:open");

        Assert.Equal(new FieldFilter("status", FilterOperator.Equals, new FilterValue.Bool(true)),
            Assert.Single(done.Filters));
        Assert.True(done.ImpliesIncludeCompleted);
        Assert.Equal(new FilterValue.Bool(false), Assert.Single(open.Filters).Value);
        Assert.False(open.ImpliesIncludeCompleted);
    }

    [Fact]
    public void Is_with_another_word_is_an_error()
    {
        var result = Parse("is:late");

        Assert.Contains("done or open", Assert.Single(result.Errors).Message);
    }

    [Fact]
    public void A_full_example_from_the_plan_parses_into_text_and_three_filters()
    {
        var result = Parse("type:error priority>=high due<2026-12-01 \"deadlock\"");

        Assert.Equal("deadlock", result.Text);
        Assert.Equal(["type", "priority", "due"], result.Filters.Select(filter => filter.FieldKey));
    }

    [Fact]
    public void Unknown_key_suggests_the_nearest_field()
    {
        var result = Parse("tpye:error");

        var error = Assert.Single(result.Errors);
        Assert.Equal(0, error.Position);
        Assert.Equal("tpye:error".Length, error.Length);
        Assert.Contains("Did you mean 'type'?", error.Message);
    }

    [Fact]
    public void Unknown_key_with_no_close_match_lists_the_fields()
    {
        var result = Parse("zzzzzz:1");

        Assert.Contains("Fields you can use: title, ticket", Assert.Single(result.Errors).Message);
    }

    [Fact]
    public void An_operator_the_field_does_not_support_names_the_ones_it_does()
    {
        var result = Parse("title>3");

        var message = Assert.Single(result.Errors).Message;
        Assert.Contains("does not support '>'", message);
        Assert.Contains(":, !=, ~", message);
    }

    [Fact]
    public void A_missing_value_is_an_error()
    {
        var result = Parse("title: due:today");

        Assert.Equal("A value is needed here.", Assert.Single(result.Errors).Message);
    }

    [Fact]
    public void An_unterminated_quote_reports_where_it_started()
    {
        var result = Parse("ok title:\"abc");

        var error = Assert.Single(result.Errors);
        Assert.Equal(3, error.Position);
        Assert.Contains("never closed", error.Message);
    }

    [Fact]
    public void An_unterminated_phrase_is_an_error()
    {
        var result = Parse("hello \"world");

        Assert.Equal(6, Assert.Single(result.Errors).Position);
    }

    [Fact]
    public void Several_errors_are_all_reported_in_position_order()
    {
        var result = Parse("effort:x due:never zzz:1");

        Assert.Equal([0, 9, 19], result.Errors.Select(error => error.Position));
        Assert.Empty(result.Filters);
        Assert.False(result.Succeeded);
    }

    [Fact]
    public void Text_after_a_closing_quote_without_a_space_is_an_error()
    {
        var result = Parse("title:\"abc\"def");

        Assert.Contains("space after a quoted value", Assert.Single(result.Errors).Message);
    }

    [Fact]
    public void Describe_names_the_offending_token_and_one_based_character()
    {
        var text = "ok tpye:error";
        var result = Parse(text);

        var description = Assert.Single(result.Errors).Describe(text);

        Assert.Contains("(at \"tpye:error\", character 4)", description);
    }

    [Fact]
    public void Clause_keys_lists_the_keys_used_so_choices_load_only_when_needed()
    {
        var keys = ItemQueryParser.ClauseKeys("hello Type:error priority>high type:x");

        Assert.Equal(["type", "priority"], keys);
    }

    [Fact]
    public void A_colon_word_that_is_not_a_field_must_be_quoted_to_be_text()
    {
        var unquoted = Parse("http://example");
        var quoted = Parse("\"http://example\"");

        Assert.False(unquoted.Succeeded);
        Assert.Equal("http://example", quoted.Text);
    }
}