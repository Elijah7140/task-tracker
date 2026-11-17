#pragma warning disable xUnit1051
using TaskTracker.Core;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Search;
using TaskTracker.Presentation.Navigation;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class SearchViewModelTests
{
    [Fact]
    public async Task Search_from_home_defaults_to_all_projects()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var shell = SearchTestShell.Create(store);
        await shell.GoHomeAsync();

        await shell.OpenSearchAsync();

        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        Assert.Equal(SearchScopeKind.AllProjects, page.SelectedScope.Kind);
        Assert.Equal([SearchScopeKind.AllProjects], page.ScopeOptions.Select(option => option.Kind));
        Assert.False(page.IncludeCompleted);
        Assert.False(page.IsFolderScope);
    }

    [Fact]
    public async Task Search_from_project_root_offers_project_scope_but_not_folder_scope()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var shell = SearchTestShell.Create(store);
        await shell.OpenProjectAsync(project.Id);

        await shell.OpenSearchAsync();

        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        Assert.Equal(SearchScopeKind.Project, page.SelectedScope.Kind);
        Assert.Equal([SearchScopeKind.AllProjects, SearchScopeKind.Project],
            page.ScopeOptions.Select(option => option.Kind));
    }

    [Fact]
    public async Task Search_from_selected_folder_defaults_to_folder_scope()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var folder = await store.Folders.CreateAsync(project.Id, null, "dbo");
        var shell = SearchTestShell.Create(store);
        await shell.OpenProjectAsync(project.Id);
        var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        workspace.Select(workspace.FolderRoots[0].Children.Single());

        await shell.OpenSearchAsync();

        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        Assert.Equal(SearchScopeKind.Folder, page.SelectedScope.Kind);
        Assert.Equal("This folder", page.SelectedScope.Label);
        Assert.True(page.IncludeSubfolders);
        Assert.Equal(folder.Id, workspace.SelectedFolder?.Id);
    }

    [Fact]
    public async Task Changing_to_project_scope_drops_another_projects_field()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var first = await store.Projects.CreateAsync("First");
        var second = await store.Projects.CreateAsync("Second");
        var otherField = await store.Fields.CreateAsync("Review score", FieldDataType.Number, second.Id);
        var shell = SearchTestShell.Create(store);
        await shell.OpenProjectAsync(first.Id);
        await shell.OpenSearchAsync();
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        await ChooseScopeAsync(page, SearchScopeKind.AllProjects);
        page.AddFilterCommand.Execute(null);
        var row = Assert.Single(page.Filters);
        row.SelectedField = row.Fields.Single(field => field.Key == otherField.Key);

        await ChooseScopeAsync(page, SearchScopeKind.Project);

        Assert.Empty(page.Filters);
    }

    [Fact]
    public async Task Changing_scope_keeps_filled_rows_and_blank_rows()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var shell = SearchTestShell.Create(store);
        await shell.OpenProjectAsync(project.Id);
        await shell.OpenSearchAsync();
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        page.AddFilterCommand.Execute(null);
        page.AddFilterCommand.Execute(null);
        var filled = page.Filters[0];
        filled.SelectedField = filled.Fields.Single(field => field.Key == "title");
        filled.SelectedOperator = filled.Operators.Single(option => option.Operator == FilterOperator.NotEquals);
        filled.FirstText = "invoice";

        await ChooseScopeAsync(page, SearchScopeKind.AllProjects);

        Assert.Equal(2, page.Filters.Count);
        Assert.Equal("title", filled.SelectedField?.Key);
        Assert.Equal(FilterOperator.NotEquals, filled.SelectedOperator?.Operator);
        Assert.Equal("invoice", filled.FirstText);
        Assert.Null(page.Filters[1].SelectedField);
    }

    [Fact]
    public async Task Invalid_range_shows_an_inline_error_and_keeps_the_old_results()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var definition = await store.Fields.CreateAsync("Effort", FieldDataType.Number, project.Id);
        await store.Items.CreateAsync(project.Id, null, null, "Review invoice");
        var shell = SearchTestShell.Create(store);
        await shell.OpenProjectAsync(project.Id);
        await shell.OpenSearchAsync();
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        page.Text = "invoice";
        await page.RunAsync();
        page.AddFilterCommand.Execute(null);
        var row = Assert.Single(page.Filters);
        row.SelectedField = row.Fields.Single(field => field.Key == definition.Key);
        row.SelectedOperator = row.Operators.Single(option => option.Operator == FilterOperator.Between);
        row.FirstText = "5";
        row.SecondText = "1";

        await page.RunAsync();

        Assert.NotNull(row.ValueError);
        Assert.False(page.CanSearch);
        Assert.False(page.IsBusy);
        Assert.Equal("Review invoice", Assert.Single(page.Results).Title);
    }

    [Fact]
    public async Task Date_range_with_min_after_max_blocks_search()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var page = await OpenPageFromHomeAsync(store);
        var row = AddRow(page, "due", FilterOperator.Between);
        row.FirstDate = new DateTimeOffset(2026, 12, 15, 0, 0, 0, TimeSpan.Zero);
        row.SecondDate = new DateTimeOffset(2026, 11, 15, 0, 0, 0, TimeSpan.Zero);

        await page.RunAsync();

        Assert.Equal("The first value must not be after the second.", row.ValueError);
        Assert.False(page.CanSearch);
        Assert.False(page.ShowEmpty);
        Assert.Empty(page.Results);
    }

    [Fact]
    public async Task Date_range_in_order_searches_without_an_error()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var page = await OpenPageFromHomeAsync(store);
        var row = AddRow(page, "due", FilterOperator.Between);
        row.FirstDate = new DateTimeOffset(2026, 11, 15, 0, 0, 0, TimeSpan.Zero);
        row.SecondDate = new DateTimeOffset(2026, 12, 15, 0, 0, 0, TimeSpan.Zero);

        await page.RunAsync();

        Assert.Null(page.Error);
        Assert.True(page.ShowEmpty);
    }

    [Fact]
    public async Task Priority_range_runs_only_from_more_important_to_less_important()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var page = await OpenPageFromHomeAsync(store);
        var row = AddRow(page, "priority", FilterOperator.Between);
        await row.ChoicesTask;
        var mostImportant = row.Choices.OrderBy(choice => choice.SortOrder).First();
        var leastImportant = row.Choices.OrderBy(choice => choice.SortOrder).Last();
        row.SelectedChoice = leastImportant;
        row.SecondChoice = mostImportant;

        Assert.False(page.CanSearch);

        row.SelectedChoice = mostImportant;
        row.SecondChoice = leastImportant;
        await page.RunAsync();

        Assert.True(page.CanSearch);
        Assert.Null(page.Error);
    }

    [Fact]
    public async Task Is_empty_sends_no_value()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var page = await OpenPageFromHomeAsync(store);
        var row = AddRow(page, "ticket", FilterOperator.IsEmpty);
        row.FirstText = "left over";

        var filter = row.ToFilter();

        Assert.False(row.HasValue);
        Assert.True(page.CanSearch);
        Assert.Equal(FilterOperator.IsEmpty, filter?.Operator);
        Assert.Null(filter?.Value);
    }

    [Fact]
    public async Task Search_failure_that_is_not_a_domain_rule_shows_inline_instead_of_escaping()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var search = new FakeSearch(_ => throw new InvalidOperationException("database is locked"));
        var page = SearchTestShell.CreatePage(store, search);

        await page.RunAsync();

        Assert.Contains("database is locked", page.Error);
        Assert.False(page.IsBusy);
    }

    [Fact]
    public async Task Domain_rule_failure_shows_its_message()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var search = new FakeSearch(_ => throw new DomainRuleException("Search project does not exist."));
        var page = SearchTestShell.CreatePage(store, search);

        await page.RunAsync();

        Assert.Equal("Search project does not exist.", page.Error);
    }

    [Fact]
    public async Task Older_search_completion_does_not_replace_newer_results()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var older = new TaskCompletionSource<ItemSearchResults>();
        var tokens = new List<CancellationToken>();
        var search = new FakeSearch(query => query.Text == "older"
            ? older.Task
            : Task.FromResult(new ItemSearchResults([Hit(project.Id, "Newer hit")], true)));
        search.TokenSeen = tokens.Add;
        var page = SearchTestShell.CreatePage(store, search);
        page.Text = "older";
        var olderRun = page.RunAsync();
        page.Text = "newer";

        await page.RunAsync();
        older.SetResult(new ItemSearchResults([Hit(project.Id, "Older hit")], false));
        await olderRun;

        Assert.Equal("Newer hit", Assert.Single(page.Results).Title);
        Assert.True(page.HasMore);
        Assert.False(page.IsBusy);
        Assert.True(tokens[0].IsCancellationRequested);
        Assert.False(tokens[1].IsCancellationRequested);
    }

    [Fact]
    public async Task Older_search_failure_after_newer_success_is_ignored()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var older = new TaskCompletionSource<ItemSearchResults>();
        var search = new FakeSearch(query => query.Text == "older"
            ? older.Task
            : Task.FromResult(new ItemSearchResults([], true)));
        using var page = SearchTestShell.CreatePage(store, search);
        page.Text = "older";
        var olderRun = page.RunAsync();
        page.Text = "newer";

        await page.RunAsync();
        older.SetException(new InvalidOperationException("old failure"));
        await olderRun;

        Assert.Null(page.Error);
        Assert.True(page.HasMore);
        Assert.False(page.IsBusy);
    }

    [Fact]
    public async Task Older_scope_failure_after_newer_success_is_ignored()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var registry = new ControlledFieldRegistry();
        using var page = SearchTestShell.CreatePage(store,
            new FakeSearch(_ => Task.FromResult(new ItemSearchResults([], false))),
            projectId: project.Id, registry: registry);
        var initialLoad = page.LoadAsync();
        registry.Complete(0);
        await initialLoad;
        page.SelectedScope = page.ScopeOptions.Single(option => option.Kind == SearchScopeKind.AllProjects);
        var olderRefresh = page.ScopeRefreshTask;
        page.SelectedScope = page.ScopeOptions.Single(option => option.Kind == SearchScopeKind.Project);

        registry.Complete(2);
        await page.ScopeRefreshTask;
        registry.Fail(1, new InvalidOperationException("old registry failure"));
        await olderRefresh;

        Assert.Null(page.Error);
        Assert.True(registry.Tokens[1].IsCancellationRequested);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Leaving_search_cancels_in_flight_work_and_discards_late_failure(bool goHome)
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var pending = new TaskCompletionSource<ItemSearchResults>();
        CancellationToken searchToken = default;
        var search = new FakeSearch(_ => pending.Task) { TokenSeen = token => searchToken = token };
        var shell = SearchTestShell.Create(store, search: search);
        await shell.GoHomeAsync();
        await shell.OpenSearchAsync();
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        var run = page.RunAsync();

        if (goHome)
        {
            await shell.GoHomeAsync();
        }
        else
        {
            await shell.ReturnFromSearchAsync();
        }

        pending.SetException(new InvalidOperationException("late failure"));
        await run;

        Assert.True(searchToken.IsCancellationRequested);
        Assert.Null(page.Error);
        Assert.Empty(page.Results);
        Assert.IsType<HomeViewModel>(shell.CurrentPage);
    }

    [Fact]
    public async Task Leaving_search_cancels_scope_refresh_and_ignores_late_failure()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var registry = new ControlledFieldRegistry();
        using var page = SearchTestShell.CreatePage(store,
            new FakeSearch(_ => Task.FromResult(new ItemSearchResults([], false))),
            projectId: project.Id, registry: registry);
        var initial = page.LoadAsync();
        registry.Complete(0);
        await initial;
        page.SelectedScope = page.ScopeOptions.Single(option => option.Kind == SearchScopeKind.AllProjects);

        page.Dispose();
        registry.Fail(1, new InvalidOperationException("late registry failure"));
        await page.ScopeRefreshTask;

        Assert.True(registry.Tokens[1].IsCancellationRequested);
        Assert.Null(page.Error);
        Assert.Empty(page.Filters);
    }

    [Fact]
    public async Task Search_uses_the_configured_limit_in_its_more_results_note()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var search = new FakeSearch(_ => Task.FromResult(new ItemSearchResults([], true)));
        var page = SearchTestShell.CreatePage(store, search, resultLimit: 3);

        await page.RunAsync();

        Assert.Equal(3, search.LastLimit);
        Assert.True(page.HasMore);
        Assert.Equal("Showing the first 3 matches — narrow your search", page.HasMoreMessage);
    }

    [Fact]
    public async Task Results_skip_hits_whose_project_was_deleted()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var kept = await store.Projects.CreateAsync("Kept");
        var removed = await store.Projects.CreateAsync("Removed");
        var hits = new[] { Hit(removed.Id, "Gone hit"), Hit(kept.Id, "Kept hit") };
        await store.Projects.DeleteAsync(removed.Id);
        var search = new FakeSearch(_ => Task.FromResult(new ItemSearchResults(hits, false)));
        var page = SearchTestShell.CreatePage(store, search);

        await page.RunAsync();

        Assert.Null(page.Error);
        Assert.Equal("Kept hit", Assert.Single(page.Results).Title);
    }

    [Fact]
    public async Task Result_rows_show_ticket_location_type_priority_and_due_date_with_time()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var folder = await store.Folders.CreateAsync(project.Id, null, "dbo");
        var subfolder = await store.Folders.CreateAsync(project.Id, folder.Id, "Tables");
        var item = await store.Items.CreateAsync(project.Id, subfolder.Id, null, "Review invoice");
        var rootItem = await store.Items.CreateAsync(project.Id, null, null, "Review root");
        var type = (await store.Lookups.ItemTypesAsync()).First();
        var priority = (await store.Lookups.PriorityLevelsAsync()).First();
        await store.Items.EditAsync(item.Id, new ItemEdit(item.Title, null, "DB-7", type.Id, priority.Id,
            new DateOnly(2026, 11, 20), new TimeOnly(14, 30), null, null));
        var shell = SearchTestShell.Create(store);
        await shell.GoHomeAsync();
        await shell.OpenSearchAsync();
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        page.Text = "Review";

        await page.RunAsync();

        var row = page.Results.Single(result => result.Item.ItemId == item.Id);
        Assert.Equal("DB-7", row.Ticket);
        Assert.Equal("Billing › dbo › Tables", row.Location);
        Assert.Equal(type.Name, row.Type);
        Assert.Equal(priority.Name, row.Priority);
        Assert.StartsWith("11/20/2026", row.Due);
        Assert.Contains("2:30", row.Due);
        var rootRow = page.Results.Single(result => result.Item.ItemId == rootItem.Id);
        Assert.Equal("Billing", rootRow.Location);
        Assert.Equal(string.Empty, rootRow.Due);
    }

    [Fact]
    public async Task Activating_a_result_asks_the_shell_to_open_it()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var hit = Hit(project.Id, "Review invoice");
        var navigation = new FakeNavigationService();
        var search = new FakeSearch(_ => Task.FromResult(new ItemSearchResults([hit], false)));
        var page = SearchTestShell.CreatePage(store, search, navigation);
        await page.RunAsync();

        await page.OpenResultAsync(page.Results.Single());

        Assert.Equal(hit, navigation.OpenedResult);
        Assert.Null(page.Error);
    }

    [Fact]
    public async Task Activating_a_missing_item_stays_on_search_and_says_so()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var navigation = new FakeNavigationService { ResultOutcome = SearchOpenOutcome.ItemMissing };
        var search = new FakeSearch(_ => Task.FromResult(
            new ItemSearchResults([Hit(project.Id, "Review invoice")], false)));
        var page = SearchTestShell.CreatePage(store, search, navigation);
        await page.RunAsync();

        await page.OpenResultAsync(page.Results.Single());

        Assert.Equal("This item no longer exists", page.Error);
        Assert.Single(page.Results);
    }

    [Fact]
    public async Task Cancelled_activation_shows_no_error()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var navigation = new FakeNavigationService { ResultOutcome = SearchOpenOutcome.Cancelled };
        var search = new FakeSearch(_ => Task.FromResult(
            new ItemSearchResults([Hit(project.Id, "Review invoice")], false)));
        var page = SearchTestShell.CreatePage(store, search, navigation);
        await page.RunAsync();

        await page.OpenResultAsync(page.Results.Single());

        Assert.Null(page.Error);
    }

    [Fact]
    public async Task Back_asks_the_shell_to_return()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var navigation = new FakeNavigationService();
        var page = SearchTestShell.CreatePage(store, new FakeSearch(_ => Task.FromResult(
            new ItemSearchResults([], false))), navigation);

        await ((CommunityToolkit.Mvvm.Input.IAsyncRelayCommand)page.BackCommand).ExecuteAsync(null);

        Assert.True(navigation.ReturnedFromSearch);
    }

    [Fact]
    public async Task Failing_field_lookup_for_a_scope_change_shows_an_error()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var registry = new ThrowingRegistry();
        var page = SearchTestShell.CreatePage(store, new FakeSearch(_ => Task.FromResult(
            new ItemSearchResults([], false))), projectId: project.Id, registry: registry);

        await ChooseScopeAsync(page, SearchScopeKind.AllProjects);

        Assert.Contains("registry offline", page.Error);
    }

    [Fact]
    public async Task Failing_choice_lookup_shows_an_error_on_the_page()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var realRegistry = new FieldRegistry(store.UnitOfWorkFactory);
        var registry = new ThrowingRegistry { Fields = await realRegistry.GetFieldsAsync(new SearchScope.AllProjects()) };
        var page = SearchTestShell.CreatePage(store, new FakeSearch(_ => Task.FromResult(
            new ItemSearchResults([], false))), registry: registry);
        await page.LoadAsync();
        page.AddFilterCommand.Execute(null);
        var row = Assert.Single(page.Filters);

        row.SelectedField = row.Fields.Single(field => field.Key == "priority");
        await row.ChoicesTask;

        Assert.Contains("registry offline", page.Error);
    }

    private static async Task ChooseScopeAsync(SearchViewModel page, SearchScopeKind kind)
    {
        page.SelectedScope = page.ScopeOptions.Single(option => option.Kind == kind);
        await page.ScopeRefreshTask;
    }

    private static async Task<SearchViewModel> OpenPageFromHomeAsync(PresentationTestStore store)
    {
        var shell = SearchTestShell.Create(store);
        await shell.GoHomeAsync();
        await shell.OpenSearchAsync();
        return Assert.IsType<SearchViewModel>(shell.CurrentPage);
    }

    private static SearchFilterRowViewModel AddRow(SearchViewModel page, string fieldKey, FilterOperator operation)
    {
        page.AddFilterCommand.Execute(null);
        var row = page.Filters[^1];
        row.SelectedField = row.Fields.Single(field => field.Key == fieldKey);
        row.SelectedOperator = row.Operators.Single(option => option.Operator == operation);
        return row;
    }

    private static ItemSearchResult Hit(Guid projectId, string title)
    {
        return new ItemSearchResult(Guid.NewGuid(), projectId, "Billing", null, null, title,
            null, null, null, null, null, false);
    }

    private sealed class FakeSearch(Func<ItemQuery, Task<ItemSearchResults>> handler) : IItemSearchService
    {
        public int? LastLimit { get; private set; }

        public Action<CancellationToken>? TokenSeen { get; set; }

        public Task<ItemSearchResults> SearchAsync(ItemQuery query, int limit = 200,
            CancellationToken cancellationToken = default)
        {
            LastLimit = limit;
            TokenSeen?.Invoke(cancellationToken);
            return handler(query);
        }
    }

    private sealed class ThrowingRegistry : IFieldRegistry
    {
        public IReadOnlyList<SearchableField> Fields { get; set; } = [];

        public Task<IReadOnlyList<SearchableField>> GetFieldsAsync(SearchScope scope,
            CancellationToken cancellationToken = default)
        {
            if (Fields.Count > 0)
            {
                return Task.FromResult(Fields);
            }

            throw new InvalidOperationException("registry offline");
        }

        public Task<IReadOnlyList<SearchChoice>> GetChoicesAsync(SearchableField field,
            CancellationToken cancellationToken = default)
        {
            throw new InvalidOperationException("registry offline");
        }
    }

    private sealed class ControlledFieldRegistry : IFieldRegistry
    {
        private readonly List<TaskCompletionSource<IReadOnlyList<SearchableField>>> requests = [];

        public List<CancellationToken> Tokens { get; } = [];

        public Task<IReadOnlyList<SearchableField>> GetFieldsAsync(SearchScope scope,
            CancellationToken cancellationToken = default)
        {
            Tokens.Add(cancellationToken);
            var request = new TaskCompletionSource<IReadOnlyList<SearchableField>>();
            requests.Add(request);
            return request.Task;
        }

        public Task<IReadOnlyList<SearchChoice>> GetChoicesAsync(SearchableField field,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult<IReadOnlyList<SearchChoice>>([]);
        }

        public void Complete(int index)
        {
            requests[index].SetResult([]);
        }

        public void Fail(int index, Exception exception)
        {
            requests[index].SetException(exception);
        }
    }
}