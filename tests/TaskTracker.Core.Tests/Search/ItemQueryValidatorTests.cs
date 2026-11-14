#pragma warning disable xUnit1051
using TaskTracker.Core;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Search;

namespace TaskTracker.Core.Tests.Search;

public sealed class ItemQueryValidatorTests
{
    [Fact]
    public async Task Unknown_field_and_wrong_operator_are_rejected()
    {
        var validator = new ItemQueryValidator(new SearchTestUnitOfWork());
        var unknown = Query(new FieldFilter("unknown", FilterOperator.Equals, new FilterValue.Text("x")));
        var wrongOperator = Query(new FieldFilter("title", FilterOperator.GreaterThan,
            new FilterValue.Text("x")));

        await Assert.ThrowsAsync<DomainRuleException>(() => validator.ValidateAsync(unknown));
        await Assert.ThrowsAsync<DomainRuleException>(() => validator.ValidateAsync(wrongOperator));
    }

    [Fact]
    public async Task Wrong_value_and_bad_range_are_rejected()
    {
        var store = new SearchTestUnitOfWork();
        var field = FieldDefinition.Create("Estimate", FieldDataType.Number, null, 0, []);
        store.Definitions.Add(field);
        var validator = new ItemQueryValidator(store);
        var wrongValue = Query(new FieldFilter(field.Key, FilterOperator.Equals,
            new FilterValue.Date(new DateOnly(2026, 11, 14))));
        var badRange = Query(new FieldFilter(field.Key, FilterOperator.Between,
            new FilterValue.NumberRange(5, 2)));
        var missing = Query(new FieldFilter(field.Key, FilterOperator.Equals, null));

        await Assert.ThrowsAsync<DomainRuleException>(() => validator.ValidateAsync(wrongValue));
        await Assert.ThrowsAsync<DomainRuleException>(() => validator.ValidateAsync(badRange));
        await Assert.ThrowsAsync<DomainRuleException>(() => validator.ValidateAsync(missing));
    }

    private static ItemQuery Query(FieldFilter filter)
    {
        return new ItemQuery(new SearchScope.AllProjects(), null, [filter], true);
    }
}