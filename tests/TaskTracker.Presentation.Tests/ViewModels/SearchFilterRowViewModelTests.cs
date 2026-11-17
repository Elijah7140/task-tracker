#pragma warning disable xUnit1051
using System.Globalization;

using TaskTracker.Core.Fields;
using TaskTracker.Core.Search;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class SearchFilterRowViewModelTests
{
    [Fact]
    public async Task Number_filter_requires_valid_numbers_and_between_has_two_values()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var definition = await store.Fields.CreateAsync("Effort", FieldDataType.Number, project.Id);
        var row = await CreateRowAsync(store, new SearchScope.Project(project.Id));
        row.SelectedField = row.Fields.Single(field => field.Key == definition.Key);
        row.SelectedOperator = row.Operators.Single(option => option.Operator == FilterOperator.Between);
        row.FirstText = "bad";

        Assert.False(row.IsValid);
        Assert.False(row.IsComplete);
        Assert.True(row.IsSecondNumber);
        Assert.Equal("Enter a valid number.", row.ValueError);

        row.FirstText = "1";
        row.SecondText = "3";

        Assert.True(row.IsComplete);
        Assert.Equal(new FilterValue.NumberRange(1, 3), row.ToFilter()?.Value);
    }

    [Fact]
    public async Task A_backwards_number_range_shows_a_message_and_blocks_search()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var definition = await store.Fields.CreateAsync("Effort", FieldDataType.Number, project.Id);
        var row = await CreateRowAsync(store, new SearchScope.Project(project.Id));
        row.SelectedField = row.Fields.Single(field => field.Key == definition.Key);
        row.SelectedOperator = row.Operators.Single(option => option.Operator == FilterOperator.Between);

        row.FirstText = "5";
        row.SecondText = "1";

        Assert.Equal("The first value must not be after the second.", row.ValueError);
        Assert.False(row.IsValid);
        Assert.False(row.IsComplete);
    }

    [Fact]
    public async Task A_backwards_priority_range_asks_for_the_more_important_level_first()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var row = await CreateRowAsync(store, new SearchScope.AllProjects());
        row.SelectedField = row.Fields.Single(field => field.Key == "priority");
        row.SelectedOperator = row.Operators.Single(option => option.Operator == FilterOperator.Between);
        await row.ChoicesTask;

        row.SelectedChoice = row.Choices.Last();
        row.SecondChoice = row.Choices.First();

        Assert.Equal("Put the more important priority first.", row.ValueError);
        Assert.False(row.IsComplete);
    }

    [Fact]
    public async Task Numbers_are_parsed_in_the_current_culture()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var definition = await store.Fields.CreateAsync("Effort", FieldDataType.Number, project.Id);
        var row = await CreateRowAsync(store, new SearchScope.Project(project.Id));
        row.SelectedField = row.Fields.Single(field => field.Key == definition.Key);
        row.SelectedOperator = row.Operators.Single(option => option.Operator == FilterOperator.Equals);
        var previous = CultureInfo.CurrentCulture;

        try
        {
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("de-DE");
            row.FirstText = "1,5";

            Assert.True(row.IsValid);
            Assert.Equal(new FilterValue.Number(1.5), row.ToFilter()?.Value);

            row.FirstText = "1.5";

            Assert.False(row.IsValid);
        }
        finally
        {
            CultureInfo.CurrentCulture = previous;
        }
    }

    [Fact]
    public async Task Priority_has_ordered_operators_but_type_does_not()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var row = await CreateRowAsync(store, new SearchScope.AllProjects());

        row.SelectedField = row.Fields.Single(field => field.Key == "priority");
        Assert.Contains(row.Operators, option => option.Operator == FilterOperator.Between);
        Assert.Contains(row.Operators, option => option.Label == "more important than");
        row.SelectedField = row.Fields.Single(field => field.Key == "type");

        Assert.DoesNotContain(row.Operators, option => option.Operator == FilterOperator.Between);
    }

    [Fact]
    public async Task Changing_the_field_clears_every_value_entered_for_the_old_field()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var row = await CreateRowAsync(store, new SearchScope.AllProjects());
        row.SelectedField = row.Fields.Single(field => field.Key == "priority");
        await row.ChoicesTask;
        row.SelectedChoice = row.Choices.First();
        row.SecondChoice = row.Choices.Last();
        row.FirstText = "left over";
        row.FirstDate = new DateTime(2026, 11, 15);
        row.BooleanValue = true;

        row.SelectedField = row.Fields.Single(field => field.Key == "type");
        await row.ChoicesTask;

        Assert.Null(row.SelectedChoice);
        Assert.Null(row.SecondChoice);
        Assert.Equal(string.Empty, row.FirstText);
        Assert.Null(row.FirstDate);
        Assert.False(row.BooleanValue);
        Assert.False(row.IsComplete);
        Assert.Null(row.ToFilter()?.Value);
    }

    [Fact]
    public async Task Switching_fields_quickly_back_to_the_first_does_not_duplicate_choices()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var realRegistry = new FieldRegistry(store.UnitOfWorkFactory);
        var fields = await realRegistry.GetFieldsAsync(new SearchScope.AllProjects());
        var registry = new ControlledRegistry();
        var row = new SearchFilterRowViewModel(registry, fields, _ => { }, _ => { });
        var priority = fields.Single(field => field.Key == "priority");
        var type = fields.Single(field => field.Key == "type");
        var choice = new SearchChoice(Guid.NewGuid(), "High", 1);

        row.SelectedField = priority;
        row.SelectedField = type;
        row.SelectedField = priority;
        registry.Complete(0, [choice]);
        registry.Complete(1, [new SearchChoice(Guid.NewGuid(), "Error", 1)]);
        registry.Complete(2, [choice]);
        await row.ChoicesTask;

        Assert.Equal([choice], row.Choices);
    }

    [Fact]
    public async Task Choice_lookup_failure_is_reported_to_the_page_instead_of_being_lost()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var realRegistry = new FieldRegistry(store.UnitOfWorkFactory);
        var fields = await realRegistry.GetFieldsAsync(new SearchScope.AllProjects());
        var registry = new ControlledRegistry();
        Exception? reported = null;
        var row = new SearchFilterRowViewModel(registry, fields, _ => { }, exception => reported = exception);

        row.SelectedField = fields.Single(field => field.Key == "priority");
        registry.Fail(0, new InvalidOperationException("lookup failed"));
        await row.ChoicesTask;

        Assert.Equal("lookup failed", reported?.Message);
    }

    [Fact]
    public async Task Older_choice_failure_after_newer_success_is_ignored()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var realRegistry = new FieldRegistry(store.UnitOfWorkFactory);
        var fields = await realRegistry.GetFieldsAsync(new SearchScope.AllProjects());
        var registry = new ControlledRegistry();
        var errors = new List<Exception>();
        using var row = new SearchFilterRowViewModel(registry, fields, _ => { }, errors.Add);
        row.SelectedField = fields.Single(field => field.Key == "priority");
        var olderLoad = row.ChoicesTask;
        row.SelectedField = fields.Single(field => field.Key == "type");
        var choice = new SearchChoice(Guid.NewGuid(), "Error", 0);

        registry.Complete(1, [choice]);
        await row.ChoicesTask;
        registry.Fail(0, new InvalidOperationException("old choice failure"));
        await olderLoad;

        Assert.Empty(errors);
        Assert.Equal([choice], row.Choices);
        Assert.True(registry.Tokens[0].IsCancellationRequested);
    }

    [Fact]
    public async Task Disposing_a_row_cancels_choice_loading_and_ignores_late_failure()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var realRegistry = new FieldRegistry(store.UnitOfWorkFactory);
        var fields = await realRegistry.GetFieldsAsync(new SearchScope.AllProjects());
        var registry = new ControlledRegistry();
        var errors = new List<Exception>();
        using var row = new SearchFilterRowViewModel(registry, fields, _ => { }, errors.Add);
        row.SelectedField = fields.Single(field => field.Key == "priority");

        row.Dispose();
        registry.Fail(0, new InvalidOperationException("late choice failure"));
        await row.ChoicesTask;

        Assert.True(registry.Tokens[0].IsCancellationRequested);
        Assert.Empty(errors);
        Assert.Empty(row.Choices);
    }

    [Fact]
    public async Task Updating_fields_keeps_the_selection_and_the_entered_value()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        await store.Fields.CreateAsync("Effort", FieldDataType.Number, project.Id);
        var registry = new FieldRegistry(store.UnitOfWorkFactory);
        var projectFields = await registry.GetFieldsAsync(new SearchScope.Project(project.Id));
        var allFields = await registry.GetFieldsAsync(new SearchScope.AllProjects());
        var row = new SearchFilterRowViewModel(registry, projectFields, _ => { }, _ => { });
        row.SelectedField = row.Fields.Single(field => field.Key == "title");
        row.SelectedOperator = row.Operators.Single(option => option.Operator == FilterOperator.Contains);
        row.FirstText = "invoice";
        var changedProperties = new List<string?>();
        row.PropertyChanged += (_, args) => changedProperties.Add(args.PropertyName);

        row.UpdateFields(allFields);

        Assert.DoesNotContain(nameof(SearchFilterRowViewModel.SelectedField), changedProperties);
        Assert.Equal("title", row.SelectedField?.Key);
        Assert.Equal(FilterOperator.Contains, row.SelectedOperator?.Operator);
        Assert.Equal("invoice", row.FirstText);
        Assert.Equal(allFields.Select(field => field.Key), row.Fields.Select(field => field.Key));
    }

    private static async Task<SearchFilterRowViewModel> CreateRowAsync(PresentationTestStore store, SearchScope scope)
    {
        var registry = new FieldRegistry(store.UnitOfWorkFactory);
        var fields = await registry.GetFieldsAsync(scope);
        return new SearchFilterRowViewModel(registry, fields, _ => { }, _ => { });
    }

    private sealed class ControlledRegistry : IFieldRegistry
    {
        private readonly List<TaskCompletionSource<IReadOnlyList<SearchChoice>>> requests = [];

        public List<CancellationToken> Tokens { get; } = [];

        public Task<IReadOnlyList<SearchableField>> GetFieldsAsync(SearchScope scope,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult<IReadOnlyList<SearchableField>>([]);
        }

        public Task<IReadOnlyList<SearchChoice>> GetChoicesAsync(SearchableField field,
            CancellationToken cancellationToken = default)
        {
            Tokens.Add(cancellationToken);
            var request = new TaskCompletionSource<IReadOnlyList<SearchChoice>>();
            requests.Add(request);
            return request.Task;
        }

        public void Complete(int requestIndex, IReadOnlyList<SearchChoice> choices)
        {
            requests[requestIndex].SetResult(choices);
        }

        public void Fail(int requestIndex, Exception exception)
        {
            requests[requestIndex].SetException(exception);
        }
    }
}