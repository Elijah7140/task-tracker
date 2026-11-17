#pragma warning disable xUnit1051
using TaskTracker.Core.Fields;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Search;

namespace TaskTracker.Core.Tests.Search;

public sealed class SearchOperatorsTests
{
    [Fact]
    public void Text_fields_offer_contains_but_no_ordered_comparison()
    {
        var operators = SearchOperators.For(Field("title", FieldDataType.Text));

        Assert.Equal(
        [
            FilterOperator.Equals, FilterOperator.NotEquals, FilterOperator.Contains,
            FilterOperator.IsEmpty, FilterOperator.IsNotEmpty
        ], operators);
    }

    [Theory]
    [InlineData(FieldDataType.Number)]
    [InlineData(FieldDataType.Date)]
    public void Number_and_date_fields_offer_ordered_comparison_and_between(FieldDataType type)
    {
        var operators = SearchOperators.For(Field("effort", type, Guid.NewGuid()));

        Assert.Equal(
        [
            FilterOperator.Equals, FilterOperator.NotEquals, FilterOperator.GreaterThan,
            FilterOperator.LessThan, FilterOperator.Between, FilterOperator.IsEmpty, FilterOperator.IsNotEmpty
        ], operators);
    }

    [Fact]
    public void Built_in_priority_is_ordered_but_type_is_not()
    {
        var priority = SearchOperators.For(Field("priority", FieldDataType.Choice));
        var type = SearchOperators.For(Field("type", FieldDataType.Choice));

        Assert.Contains(FilterOperator.Between, priority);
        Assert.Equal(
            [FilterOperator.Equals, FilterOperator.NotEquals, FilterOperator.IsEmpty, FilterOperator.IsNotEmpty],
            type);
    }

    [Fact]
    public void Custom_choice_field_named_priority_is_not_ordered()
    {
        var lookalike = Field("priority", FieldDataType.Choice, Guid.NewGuid());

        Assert.DoesNotContain(FilterOperator.GreaterThan, SearchOperators.For(lookalike));
    }

    [Fact]
    public void Boolean_fields_offer_only_equality_and_emptiness()
    {
        var operators = SearchOperators.For(Field("status", FieldDataType.Boolean));

        Assert.Equal(
            [FilterOperator.Equals, FilterOperator.NotEquals, FilterOperator.IsEmpty, FilterOperator.IsNotEmpty],
            operators);
    }

    [Fact]
    public async Task Every_offered_operator_is_accepted_by_the_query_validator_with_a_suitable_value()
    {
        var store = new SearchTestUnitOfWork();
        store.TypeRows.AddRange([ItemType.Create("Change", 0), ItemType.Create("Error", 1)]);
        store.PriorityRows.AddRange([PriorityLevel.Create("High", 0), PriorityLevel.Create("Low", 1)]);
        store.Definitions.Add(FieldDefinition.Create("Notes", FieldDataType.Text, null, 0, []));
        store.Definitions.Add(FieldDefinition.Create("Effort", FieldDataType.Number, null, 1, []));
        store.Definitions.Add(FieldDefinition.Create("Reviewed on", FieldDataType.Date, null, 2, []));
        store.Definitions.Add(FieldDefinition.Create("Billable", FieldDataType.Boolean, null, 3, []));
        var registry = new FieldRegistry(store);
        var validator = new ItemQueryValidator(store);
        var scope = new SearchScope.AllProjects();
        var fields = await registry.GetFieldsAsync(scope);

        foreach (var field in fields)
        {
            var choices = await registry.GetChoicesAsync(field);

            foreach (var operation in SearchOperators.For(field))
            {
                var filter = new FieldFilter(field.Key, operation, SuitableValue(field, operation, choices));
                var query = new ItemQuery(scope, null, [filter], true);

                await validator.ValidateAsync(query);
            }
        }
    }

    private static SearchableField Field(string key, FieldDataType type, Guid? definitionId = null)
    {
        return new SearchableField(key, key, type, definitionId);
    }

    private static FilterValue? SuitableValue(SearchableField field, FilterOperator operation,
        IReadOnlyList<SearchChoice> choices)
    {
        if (operation is FilterOperator.IsEmpty or FilterOperator.IsNotEmpty)
        {
            return null;
        }

        var isRange = operation == FilterOperator.Between;
        var ranked = choices.OrderBy(choice => choice.SortOrder).ToList();

        return field.DataType switch
        {
            FieldDataType.Text => new FilterValue.Text("x"),
            FieldDataType.Boolean => new FilterValue.Bool(true),
            FieldDataType.Number => isRange ? new FilterValue.NumberRange(1, 2) : new FilterValue.Number(1),
            FieldDataType.Date => isRange ? DateRange() : new FilterValue.Date(new DateOnly(2026, 11, 14)),
            _ => isRange ? new FilterValue.ChoiceRange(ranked[0].Id, ranked[^1].Id)
                : new FilterValue.Choice(ranked[0].Id)
        };
    }

    private static FilterValue DateRange()
    {
        return new FilterValue.DateRange(new DateOnly(2026, 11, 1), new DateOnly(2026, 11, 30));
    }
}