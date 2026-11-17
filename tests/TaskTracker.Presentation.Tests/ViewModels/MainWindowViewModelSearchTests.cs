#pragma warning disable xUnit1051
using TaskTracker.Core.Items;
using TaskTracker.Core.Search;
using TaskTracker.Presentation.Navigation;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class MainWindowViewModelSearchTests
{
    [Fact]
    public async Task Activating_a_result_with_an_unsaved_editor_draft_asks_and_cancel_stays_on_search()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Review invoice");
        var dialogs = new FakeDialogService { DraftResult = DraftDecision.Cancel };
        var shell = SearchTestShell.Create(store, dialogs);
        await DirtyTheEditorAsync(shell, project.Id, item.Id);
        var search = await OpenSearchAndRunAsync(shell, "invoice");

        await search.OpenResultAsync(search.Results.Single());

        Assert.Same(search, shell.CurrentPage);
        Assert.Null(search.Error);
    }

    [Fact]
    public async Task Opening_a_result_cancels_the_search_left_behind()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Review invoice");
        var search = new ResultThenPendingSearch(item.Id, project.Id);
        var shell = SearchTestShell.Create(store, search: search);
        await shell.GoHomeAsync();
        await shell.OpenSearchAsync();
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        page.Text = "find";
        await page.RunAsync();
        page.Text = "pending";
        var pendingRun = page.RunAsync();

        await page.OpenResultAsync(Assert.Single(page.Results));
        search.FailPending();
        await pendingRun;

        Assert.True(search.PendingToken.IsCancellationRequested);
        Assert.Null(page.Error);
        Assert.Equal(item.Id, Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage).Editor?.Id);
    }

    [Fact]
    public async Task Cancelled_activation_keeps_the_draft_for_when_search_is_left_with_Back()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Review invoice");
        var shell = SearchTestShell.Create(store, new FakeDialogService { DraftResult = DraftDecision.Cancel });
        var workspace = await DirtyTheEditorAsync(shell, project.Id, item.Id);
        var search = await OpenSearchAndRunAsync(shell, "invoice");
        await search.OpenResultAsync(search.Results.Single());

        await shell.ReturnFromSearchAsync();

        Assert.Same(workspace, shell.CurrentPage);
        Assert.Equal("Draft title", workspace.Editor?.Title);
    }

    [Fact]
    public async Task Discarding_the_draft_lets_the_result_open()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Review invoice");
        var shell = SearchTestShell.Create(store, new FakeDialogService { DraftResult = DraftDecision.Discard });
        await DirtyTheEditorAsync(shell, project.Id, item.Id);
        var search = await OpenSearchAndRunAsync(shell, "invoice");

        await search.OpenResultAsync(search.Results.Single());

        var opened = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        Assert.Equal("Review invoice", opened.Editor?.Title);
    }

    [Fact]
    public async Task Saving_the_draft_keeps_the_edit_before_the_result_opens()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Review invoice");
        var shell = SearchTestShell.Create(store, new FakeDialogService { DraftResult = DraftDecision.Save });
        await DirtyTheEditorAsync(shell, project.Id, item.Id);
        var search = await OpenSearchAndRunAsync(shell, "invoice");

        await search.OpenResultAsync(search.Results.Single());

        var opened = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        Assert.Equal("Draft title", opened.Editor?.Title);
        var stored = await store.Items.LoadAreaAsync(project.Id, null);
        Assert.Equal("Draft title", Assert.Single(stored.Items).Item.Title);
    }

    [Fact]
    public async Task Activating_a_result_with_unsaved_app_settings_asks_first()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        await store.Items.CreateAsync(project.Id, null, null, "Review invoice");
        var dialogs = new FakeDialogService { ConfirmResult = false };
        var shell = SearchTestShell.Create(store, dialogs);
        await shell.OpenAppSettingsAsync();
        Assert.IsType<AppSettingsViewModel>(shell.CurrentPage).YellowAmount = 9;
        var search = await OpenSearchAndRunAsync(shell, "invoice");

        await search.OpenResultAsync(search.Results.Single());

        Assert.Same(search, shell.CurrentPage);
        Assert.Contains("Discard unsaved settings?", dialogs.ConfirmTitles);

        dialogs.ConfirmResult = true;
        await search.OpenResultAsync(search.Results.Single());

        Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
    }

    [Fact]
    public async Task Activating_a_result_with_unsaved_project_settings_asks_first()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        await store.Items.CreateAsync(project.Id, null, null, "Review invoice");
        var dialogs = new FakeDialogService { ConfirmResult = false };
        var shell = SearchTestShell.Create(store, dialogs);
        await shell.OpenProjectSettingsAsync(project.Id);
        var settings = Assert.IsType<ProjectSettingsViewModel>(shell.CurrentPage);
        settings.OverrideYellow = true;
        settings.YellowDays = 5;
        var search = await OpenSearchAndRunAsync(shell, "invoice");

        await search.OpenResultAsync(search.Results.Single());

        Assert.Same(search, shell.CurrentPage);
        Assert.Contains("Discard unsaved settings?", dialogs.ConfirmTitles);
    }

    [Fact]
    public async Task Back_without_a_return_page_goes_home()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var shell = SearchTestShell.Create(store);
        await shell.OpenSearchAsync();
        Assert.IsType<SearchViewModel>(shell.CurrentPage);

        await shell.ReturnFromSearchAsync();

        Assert.IsType<HomeViewModel>(shell.CurrentPage);
    }

    [Fact]
    public async Task Going_home_from_search_releases_the_page_search_was_opened_from()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var clock = new TimerCountingTimeProvider();
        var shell = SearchTestShell.Create(store, clock: clock);
        await shell.OpenProjectAsync(project.Id);
        var timersWithWorkspace = clock.ActiveTimers;
        await shell.OpenSearchAsync();
        Assert.Equal(timersWithWorkspace, clock.ActiveTimers);

        await shell.GoHomeAsync();

        Assert.IsType<HomeViewModel>(shell.CurrentPage);
        Assert.Equal(timersWithWorkspace - 1, clock.ActiveTimers);
    }

    [Fact]
    public async Task A_second_open_while_search_is_opening_does_not_replace_the_return_page()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var registry = new DelayedRegistry();
        var shell = SearchTestShell.Create(store, registry: registry);
        await shell.OpenProjectAsync(project.Id);
        var workspace = shell.CurrentPage;

        var firstOpen = shell.OpenSearchAsync();
        Assert.False(firstOpen.IsCompleted);
        Assert.Same(workspace, shell.CurrentPage);
        await shell.OpenSearchAsync();
        registry.Complete();
        await firstOpen;
        Assert.IsType<SearchViewModel>(shell.CurrentPage);
        await shell.ReturnFromSearchAsync();

        Assert.Same(workspace, shell.CurrentPage);
    }

    [Fact]
    public async Task Activating_a_deleted_item_stays_on_search_with_a_message()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Review invoice");
        var shell = SearchTestShell.Create(store);
        await shell.OpenProjectAsync(project.Id);
        var search = await OpenSearchAndRunAsync(shell, "invoice");
        await store.Items.DeleteAsync(project.Id, null, item.Id);

        await search.OpenResultAsync(search.Results.Single());

        Assert.Same(search, shell.CurrentPage);
        Assert.Equal("This item no longer exists", search.Error);
    }

    [Fact]
    public async Task Activating_an_item_of_a_deleted_project_stays_on_search_with_a_message()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        await store.Items.CreateAsync(project.Id, null, null, "Review invoice");
        var shell = SearchTestShell.Create(store);
        await shell.GoHomeAsync();
        var search = await OpenSearchAndRunAsync(shell, "invoice");
        await store.Projects.DeleteAsync(project.Id);

        await search.OpenResultAsync(search.Results.Single());

        Assert.Same(search, shell.CurrentPage);
        Assert.Equal("This item no longer exists", search.Error);
    }

    [Fact]
    public async Task Activating_a_moved_item_opens_the_folder_it_is_in_now()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var folder = await store.Folders.CreateAsync(project.Id, null, "dbo");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Review invoice");
        var shell = SearchTestShell.Create(store);
        await shell.GoHomeAsync();
        var search = await OpenSearchAndRunAsync(shell, "invoice");
        await store.Items.MoveToAreaAsync(project.Id, null, folder.Id, item.Id);

        await search.OpenResultAsync(search.Results.Single());

        var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        Assert.Equal(folder.Id, workspace.SelectedFolder?.Id);
        Assert.Equal(item.Id, workspace.Editor?.Id);
    }

    [Fact]
    public async Task Activating_an_open_top_level_item_leaves_the_completed_section_collapsed()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Review invoice");
        var done = await store.Items.CreateAsync(project.Id, null, null, "Finished invoice");
        await store.Items.SetCompletedAsync(project.Id, null, done.Id, true);
        var shell = SearchTestShell.Create(store);
        await shell.GoHomeAsync();
        var search = await OpenSearchAndRunAsync(shell, "Review");

        await search.OpenResultAsync(search.Results.Single());

        var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        Assert.Equal(item.Id, workspace.Editor?.Id);
        Assert.False(workspace.IsCompletedExpanded);
    }

    [Fact]
    public async Task Activating_a_completed_top_level_item_expands_the_completed_section()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var done = await store.Items.CreateAsync(project.Id, null, null, "Finished invoice");
        await store.Items.SetCompletedAsync(project.Id, null, done.Id, true);
        var shell = SearchTestShell.Create(store);
        await shell.GoHomeAsync();
        var search = await OpenSearchAndRunAsync(shell, "Finished", includeCompleted: true);

        await search.OpenResultAsync(search.Results.Single());

        var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        Assert.Equal(done.Id, workspace.Editor?.Id);
        Assert.True(workspace.IsCompletedExpanded);
    }

    [Fact]
    public async Task Activating_a_sub_item_expands_its_parent_and_selects_it()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var parent = await store.Items.CreateAsync(project.Id, null, null, "Parent work");
        var child = await store.Items.CreateAsync(project.Id, null, parent.Id, "Child needle");
        var shell = SearchTestShell.Create(store);
        await shell.GoHomeAsync();
        var search = await OpenSearchAndRunAsync(shell, "needle");

        await search.OpenResultAsync(search.Results.Single());

        var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        var parentRow = workspace.OpenItems.Single(row => row.Id == parent.Id);
        Assert.True(parentRow.IsExpanded);
        Assert.False(parentRow.IsCompletedExpanded);
        Assert.Equal(child.Id, workspace.Editor?.Id);
    }

    [Fact]
    public async Task Activating_a_completed_sub_item_expands_its_parents_completed_children()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var parent = await store.Items.CreateAsync(project.Id, null, null, "Parent work");
        var done = await store.Items.CreateAsync(project.Id, null, parent.Id, "Finished needle");
        await store.Items.CreateAsync(project.Id, null, parent.Id, "Still open");
        await store.Items.SetCompletedAsync(project.Id, null, done.Id, true);
        var shell = SearchTestShell.Create(store);
        await shell.GoHomeAsync();
        var search = await OpenSearchAndRunAsync(shell, "needle", includeCompleted: true);

        await search.OpenResultAsync(search.Results.Single());

        var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        var parentRow = workspace.OpenItems.Single(row => row.Id == parent.Id);
        Assert.True(parentRow.IsExpanded);
        Assert.True(parentRow.IsCompletedExpanded);
        Assert.Equal(done.Id, workspace.Editor?.Id);
    }

    [Fact]
    public async Task Loading_a_workspace_reports_false_when_the_user_cancels_leaving_a_draft()
    {
        await using var store = new PresentationTestStore();
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("Billing");
        var item = await store.Items.CreateAsync(project.Id, null, null, "Review invoice");
        var dialogs = new FakeDialogService { DraftResult = DraftDecision.Cancel };
        using var page = TestWorkspaceFactory.CreateItemPage(store, project.Id, dialogs);
        Assert.True(await page.LoadAsync());
        await page.SelectItemAsync(page.OpenItems.Single());
        page.Editor!.Title = "Draft title";

        var loaded = await page.LoadAsync();

        Assert.False(loaded);
        Assert.Equal("Draft title", page.Editor.Title);
        Assert.Equal(item.Id, page.Editor.Id);
    }

    private static async Task<ProjectWorkspaceViewModel> DirtyTheEditorAsync(
        MainWindowViewModel shell, Guid projectId, Guid itemId)
    {
        await shell.OpenProjectAsync(projectId);
        var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        await workspace.SelectItemAsync(workspace.OpenItems.Single(row => row.Id == itemId));
        workspace.Editor!.Title = "Draft title";
        return workspace;
    }

    private static async Task<SearchViewModel> OpenSearchAndRunAsync(
        MainWindowViewModel shell, string text, bool includeCompleted = false)
    {
        await shell.OpenSearchAsync();
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        page.Text = text;
        page.IncludeCompleted = includeCompleted;
        await page.RunAsync();
        return page;
    }

    /// <summary>Counts timers that were created and not yet disposed.</summary>
    private sealed class TimerCountingTimeProvider : TimeProvider
    {
        public int ActiveTimers { get; private set; }

        public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
        {
            ActiveTimers++;
            return new CountedTimer(base.CreateTimer(callback, state, dueTime, period), () => ActiveTimers--);
        }
    }

    private sealed class CountedTimer(ITimer inner, Action onDisposed) : ITimer
    {
        private bool disposed;

        public bool Change(TimeSpan dueTime, TimeSpan period)
        {
            return inner.Change(dueTime, period);
        }

        public void Dispose()
        {
            if (!disposed)
            {
                disposed = true;
                onDisposed();
            }

            inner.Dispose();
        }

        public ValueTask DisposeAsync()
        {
            Dispose();
            return ValueTask.CompletedTask;
        }
    }

    private sealed class DelayedRegistry : IFieldRegistry
    {
        private readonly TaskCompletionSource<IReadOnlyList<SearchableField>> request = new();

        public Task<IReadOnlyList<SearchableField>> GetFieldsAsync(SearchScope scope,
            CancellationToken cancellationToken = default)
        {
            return request.Task;
        }

        public Task<IReadOnlyList<SearchChoice>> GetChoicesAsync(SearchableField field,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult<IReadOnlyList<SearchChoice>>([]);
        }

        public void Complete()
        {
            request.SetResult([]);
        }
    }

    private sealed class ResultThenPendingSearch(Guid itemId, Guid projectId) : IItemSearchService
    {
        private readonly TaskCompletionSource<ItemSearchResults> pending = new();

        public CancellationToken PendingToken { get; private set; }

        public Task<ItemSearchResults> SearchAsync(ItemQuery query, int limit = 200,
            CancellationToken cancellationToken = default)
        {
            if (query.Text == "pending")
            {
                PendingToken = cancellationToken;
                return pending.Task;
            }

            var hit = new ItemSearchResult(itemId, projectId, "Billing", null, null,
                "Review invoice", null, null, null, null, null, false);
            return Task.FromResult(new ItemSearchResults([hit], false));
        }

        public void FailPending()
        {
            pending.SetException(new InvalidOperationException("late search failure"));
        }
    }
}