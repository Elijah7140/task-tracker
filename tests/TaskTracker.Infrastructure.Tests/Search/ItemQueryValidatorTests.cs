#pragma warning disable xUnit1051
using TaskTracker.Core;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Search;
using TaskTracker.Infrastructure.Persistence;
using TaskTracker.Infrastructure.Tests.Persistence;

namespace TaskTracker.Infrastructure.Tests.Search;

public sealed class ItemQueryValidatorTests
{
    [Fact]
    public async Task Choice_ids_must_belong_to_their_filter_field()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var fieldA = FieldDefinition.Create("Field A", FieldDataType.Choice, null, 0, []);
        var fieldB = FieldDefinition.Create("Field B", FieldDataType.Choice, null, 1, [fieldA.Key]);
        var choiceB = FieldChoice.Create(fieldB.Id, "B", 0);
        database.FieldDefinitions.AddRange(fieldA, fieldB);
        database.FieldChoices.Add(choiceB);
        await database.SaveChangesAsync();
        var validator = CreateValidator(database);
        var wrongCustom = new FieldFilter(fieldA.Key, FilterOperator.Equals,
            new FilterValue.Choice(choiceB.Id));
        var priorityAsType = new FieldFilter("type", FilterOperator.Equals,
            new FilterValue.Choice(BuiltInLookups.HighId));
        var typeAsPriority = new FieldFilter("priority", FilterOperator.Equals,
            new FilterValue.Choice(BuiltInLookups.ChangeId));

        foreach (var filter in new[] { wrongCustom, priorityAsType, typeAsPriority })
        {
            var query = new ItemQuery(new SearchScope.AllProjects(), null, [filter], true);
            await Assert.ThrowsAsync<DomainRuleException>(() => validator.ValidateAsync(query));
        }
    }

    [Theory]
    [InlineData("missing", FilterOperator.Equals, "text")]
    [InlineData("title", FilterOperator.GreaterThan, "text")]
    [InlineData("title", FilterOperator.Equals, "none")]
    [InlineData("title", FilterOperator.Equals, "number")]
    [InlineData("due", FilterOperator.Between, "date")]
    [InlineData("due", FilterOperator.Between, "reversed-date-range")]
    [InlineData("completed", FilterOperator.Contains, "bool")]
    [InlineData("completed", FilterOperator.IsEmpty, "bool")]
    [InlineData("type", FilterOperator.Equals, "foreign-choice")]
    [InlineData("priority", FilterOperator.Between, "reversed-choice-range")]
    [InlineData("priority", FilterOperator.Equals, "number")]
    [InlineData("ticket", FilterOperator.IsNotEmpty, "text")]
    public async Task Invalid_filters_throw_a_domain_rule_exception(
        string key, FilterOperator operation, string valueKind)
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var project = Project.Create("Project", store.Clock);
        database.Projects.Add(project);
        await database.SaveChangesAsync();
        var validator = CreateValidator(database);
        var value = Value(valueKind);
        var query = new ItemQuery(new SearchScope.Project(project.Id), null,
            [new FieldFilter(key, operation, value)], true);

        await Assert.ThrowsAsync<DomainRuleException>(() => validator.ValidateAsync(query));
    }

    [Fact]
    public async Task Reversed_priority_range_and_archived_choice_are_rejected()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var first = TaskTracker.Core.Lookups.PriorityLevel.Create("First", 0);
        var second = TaskTracker.Core.Lookups.PriorityLevel.Create("Second", 1);
        var field = FieldDefinition.Create("Category", FieldDataType.Choice, null, 0, []);
        var archived = FieldChoice.Create(field.Id, "Old", 0);
        archived.Archive();
        database.PriorityLevels.AddRange(first, second);
        database.FieldDefinitions.Add(field);
        database.FieldChoices.Add(archived);
        await database.SaveChangesAsync();
        var validator = CreateValidator(database);
        var reversed = new FieldFilter("priority", FilterOperator.Between,
            new FilterValue.ChoiceRange(second.Id, first.Id));
        var oldChoice = new FieldFilter(field.Key, FilterOperator.Equals,
            new FilterValue.Choice(archived.Id));

        await Assert.ThrowsAsync<DomainRuleException>(() => validator.ValidateAsync(
            new ItemQuery(new SearchScope.AllProjects(), null, [reversed], true)));
        await Assert.ThrowsAsync<DomainRuleException>(() => validator.ValidateAsync(
            new ItemQuery(new SearchScope.AllProjects(), null, [oldChoice], true)));
    }

    [Fact]
    public async Task Invalid_custom_values_and_ranges_are_rejected()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var number = FieldDefinition.Create("Estimate", FieldDataType.Number, null, 0, []);
        var archived = FieldDefinition.Create("Archived", FieldDataType.Text, null, 1, [number.Key]);
        archived.Archive();
        database.FieldDefinitions.AddRange(number, archived);
        await database.SaveChangesAsync();
        var validator = CreateValidator(database);
        var invalidFilters = new FieldFilter[]
        {
            new(number.Key, FilterOperator.Between, new FilterValue.NumberRange(4, 3)),
            new(number.Key, FilterOperator.Equals, new FilterValue.Number(double.NaN)),
            new(number.Key, FilterOperator.Contains, new FilterValue.Number(3)),
            new(number.Key, FilterOperator.Equals, new FilterValue.Date(new DateOnly(2026, 11, 14))),
            new(archived.Key, FilterOperator.Equals, new FilterValue.Text("hidden"))
        };

        foreach (var filter in invalidFilters)
        {
            var query = new ItemQuery(new SearchScope.AllProjects(), null, [filter], true);
            await Assert.ThrowsAsync<DomainRuleException>(() => validator.ValidateAsync(query));
        }
    }

    [Fact]
    public async Task Missing_or_deleted_project_and_wrong_folder_are_rejected()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var project = Project.Create("Project", store.Clock);
        database.Projects.Add(project);
        await database.SaveChangesAsync();
        var validator = CreateValidator(database);
        var missing = new ItemQuery(new SearchScope.Project(Guid.CreateVersion7()), null, [], true);
        var wrongFolder = new ItemQuery(new SearchScope.Area(project.Id, Guid.CreateVersion7(), false), null, [], true);

        await Assert.ThrowsAsync<DomainRuleException>(() => validator.ValidateAsync(missing));
        await Assert.ThrowsAsync<DomainRuleException>(() => validator.ValidateAsync(wrongFolder));
        project.Delete(Guid.CreateVersion7(), store.Clock);
        await database.SaveChangesAsync();
        var deleted = new ItemQuery(new SearchScope.Project(project.Id), null, [], true);
        await Assert.ThrowsAsync<DomainRuleException>(() => validator.ValidateAsync(deleted));
    }

    [Fact]
    public async Task Valid_priority_range_and_empty_filter_are_accepted()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var first = TaskTracker.Core.Lookups.PriorityLevel.Create("First", 0);
        var second = TaskTracker.Core.Lookups.PriorityLevel.Create("Second", 1);
        database.PriorityLevels.AddRange(first, second);
        await database.SaveChangesAsync();
        var validator = CreateValidator(database);
        var filters = new FieldFilter[]
        {
            new("priority", FilterOperator.Between, new FilterValue.ChoiceRange(first.Id, second.Id)),
            new("ticket", FilterOperator.IsEmpty, null)
        };
        var query = new ItemQuery(new SearchScope.AllProjects(), null, filters, true);

        var fields = await validator.ValidateAsync(query);

        Assert.NotEmpty(fields);
    }

    private static ItemQueryValidator CreateValidator(TaskTrackerDbContext database)
    {
        var factory = new TestUnitOfWorkFactory(database);
        return new ItemQueryValidator(factory);
    }

    private static FilterValue? Value(string kind)
    {
        return kind switch
        {
            "text" => new FilterValue.Text("test"),
            "number" => new FilterValue.Number(2),
            "date" => new FilterValue.Date(new DateOnly(2026, 11, 14)),
            "bool" => new FilterValue.Bool(true),
            "foreign-choice" => new FilterValue.Choice(Guid.CreateVersion7()),
            "reversed-date-range" => new FilterValue.DateRange(
                new DateOnly(2026, 11, 15), new DateOnly(2026, 11, 14)),
            "reversed-choice-range" => new FilterValue.ChoiceRange(Guid.CreateVersion7(), Guid.CreateVersion7()),
            _ => null
        };
    }
}