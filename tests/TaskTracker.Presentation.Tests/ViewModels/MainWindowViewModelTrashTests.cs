#pragma warning disable xUnit1051
using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Trash;
using TaskTracker.Presentation.Navigation;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>Shell navigation to and from the trash, against a real database.</summary>
public sealed class MainWindowViewModelTrashTests
{
    private static readonly DateTimeOffset NoonOnTheThirteenth = new(2026, 11, 13, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Trash_opened_from_a_workspace_is_scoped_to_that_project_and_keeps_the_draft()
    {
        var scenario = await Scenario.CreateAsync(DraftDecision.Cancel);
        await using var store = scenario.Store;

        await scenario.Shell.OpenTrashAsync();

        var trash = Assert.IsType<TrashViewModel>(scenario.Shell.CurrentPage);
        Assert.Equal(TrashViewModel.ThisProjectScope, trash.SelectedScope);
        Assert.Equal("Old task", Assert.Single(trash.Batches).Title);
        Assert.Equal(0, scenario.Dialogs.DraftPromptCount);
        Assert.Equal("Draft title", scenario.Workspace.Editor?.Title);
    }

    [Fact]
    public async Task Back_without_a_restore_returns_to_the_same_workspace_without_asking()
    {
        var scenario = await Scenario.CreateAsync(DraftDecision.Cancel);
        await using var store = scenario.Store;
        await scenario.Shell.OpenTrashAsync();

        await scenario.Shell.ReturnFromTrashAsync();

        Assert.Same(scenario.Workspace, scenario.Shell.CurrentPage);
        Assert.Equal(0, scenario.Dialogs.DraftPromptCount);
        Assert.Equal("Draft title", scenario.Workspace.Editor?.Title);
    }

    [Fact]
    public async Task Trash_opened_from_home_covers_all_projects_and_Back_returns_to_home()
    {
        var scenario = await Scenario.CreateAsync(DraftDecision.Cancel);
        await using var store = scenario.Store;
        await scenario.Shell.GoHomeAsync();
        var home = Assert.IsType<HomeViewModel>(scenario.Shell.CurrentPage);

        await scenario.Shell.OpenTrashAsync();
        var trash = Assert.IsType<TrashViewModel>(scenario.Shell.CurrentPage);
        await scenario.Shell.ReturnFromTrashAsync();

        Assert.Equal(TrashViewModel.AllProjectsScope, trash.SelectedScope);
        Assert.Same(home, scenario.Shell.CurrentPage);
    }

    [Fact]
    public async Task Trash_opened_twice_in_a_row_does_not_stack_pages()
    {
        var scenario = await Scenario.CreateAsync(DraftDecision.Cancel);
        await using var store = scenario.Store;

        await scenario.Shell.OpenTrashAsync();
        var first = scenario.Shell.CurrentPage;
        await scenario.Shell.OpenTrashAsync();

        Assert.Same(first, scenario.Shell.CurrentPage);
        await scenario.Shell.ReturnFromTrashAsync();
        Assert.Same(scenario.Workspace, scenario.Shell.CurrentPage);
    }

    [Fact]
    public async Task Search_calendar_and_trash_share_one_return_page()
    {
        var scenario = await Scenario.CreateAsync(DraftDecision.Cancel);
        await using var store = scenario.Store;

        await scenario.Shell.OpenTrashAsync();
        await scenario.Shell.OpenSearchAsync();
        Assert.IsType<SearchViewModel>(scenario.Shell.CurrentPage);
        await scenario.Shell.OpenTrashAsync();
        await scenario.Shell.OpenCalendarAsync();
        Assert.IsType<CalendarViewModel>(scenario.Shell.CurrentPage);
        await scenario.Shell.OpenTrashAsync();
        var trash = Assert.IsType<TrashViewModel>(scenario.Shell.CurrentPage);
        await scenario.Shell.ReturnFromTrashAsync();

        Assert.Equal(TrashViewModel.ThisProjectScope, trash.SelectedScope);
        Assert.Same(scenario.Workspace, scenario.Shell.CurrentPage);
        Assert.Equal(0, scenario.Dialogs.DraftPromptCount);
    }

    [Fact]
    public async Task Opening_search_or_calendar_from_the_trash_disposes_the_trash_page()
    {
        var scenario = await Scenario.CreateAsync(DraftDecision.Cancel);
        await using var store = scenario.Store;
        await scenario.Shell.OpenTrashAsync();
        var trash = Assert.IsType<TrashViewModel>(scenario.Shell.CurrentPage);

        await scenario.Shell.OpenSearchAsync();
        var projectId = scenario.Workspace.ProjectId;
        var another = await store.Items.CreateAsync(projectId, null, null, "Another");
        await store.Items.DeleteAsync(projectId, null, another.Id);
        trash.SelectedScope = TrashViewModel.AllProjectsScope;
        await Task.Delay(50);

        Assert.IsType<SearchViewModel>(scenario.Shell.CurrentPage);
        Assert.Equal("Old task", Assert.Single(trash.Batches).Title);
    }

    [Fact]
    public async Task Back_after_a_restore_asks_the_draft_question_and_cancelling_stays_in_the_trash()
    {
        var scenario = await Scenario.CreateAsync(DraftDecision.Cancel);
        await using var store = scenario.Store;
        await scenario.Shell.OpenTrashAsync();
        var trash = Assert.IsType<TrashViewModel>(scenario.Shell.CurrentPage);
        await trash.RestoreAsync(trash.Batches[0]);

        await scenario.Shell.ReturnFromTrashAsync();

        Assert.Same(trash, scenario.Shell.CurrentPage);
        Assert.Equal(1, scenario.Dialogs.DraftPromptCount);
        Assert.Equal("Draft title", scenario.Workspace.Editor?.Title);
    }

    [Fact]
    public async Task Back_after_a_restore_reloads_the_workspace_so_the_item_shows_up()
    {
        var scenario = await Scenario.CreateAsync(DraftDecision.Discard);
        await using var store = scenario.Store;
        await scenario.Shell.OpenTrashAsync();
        var trash = Assert.IsType<TrashViewModel>(scenario.Shell.CurrentPage);
        await trash.RestoreAsync(trash.Batches[0]);

        await scenario.Shell.ReturnFromTrashAsync();

        Assert.Same(scenario.Workspace, scenario.Shell.CurrentPage);
        Assert.Equal(1, scenario.Dialogs.DraftPromptCount);
        Assert.Contains(scenario.Workspace.OpenItems, row => row.Title == "Old task");
    }

    [Fact]
    public async Task Back_after_a_restore_keeps_the_selected_item()
    {
        var scenario = await Scenario.CreateAsync(DraftDecision.Discard);
        await using var store = scenario.Store;
        var selectedId = scenario.Workspace.OpenItems.Single(row => row.IsSelected).Id;
        await scenario.Shell.OpenTrashAsync();
        var trash = Assert.IsType<TrashViewModel>(scenario.Shell.CurrentPage);
        await trash.RestoreAsync(trash.Batches[0]);

        await scenario.Shell.ReturnFromTrashAsync();

        Assert.Equal(selectedId, scenario.Workspace.OpenItems.Single(row => row.IsSelected).Id);
        Assert.Equal("Review invoice", scenario.Workspace.Editor?.Title);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task A_restore_is_not_forgotten_when_search_or_the_calendar_replaces_the_trash(bool viaSearch)
    {
        var scenario = await Scenario.CreateAsync(DraftDecision.Discard);
        await using var store = scenario.Store;
        await scenario.Shell.OpenTrashAsync();
        var trash = Assert.IsType<TrashViewModel>(scenario.Shell.CurrentPage);
        await trash.RestoreAsync(trash.Batches[0]);
        await (viaSearch ? scenario.Shell.OpenSearchAsync() : scenario.Shell.OpenCalendarAsync());
        Assert.Equal(0, scenario.Dialogs.DraftPromptCount);

        if (viaSearch)
        {
            await scenario.Shell.ReturnFromSearchAsync();
        }
        else
        {
            await scenario.Shell.ReturnFromCalendarAsync();
        }

        Assert.Same(scenario.Workspace, scenario.Shell.CurrentPage);
        Assert.Equal(1, scenario.Dialogs.DraftPromptCount);
        Assert.Contains(scenario.Workspace.OpenItems, row => row.Title == "Old task");
    }

    [Fact]
    public async Task Cancelling_the_draft_question_on_the_way_back_from_search_keeps_search_open_and_still_refreshes_later()
    {
        var scenario = await Scenario.CreateAsync(DraftDecision.Cancel);
        await using var store = scenario.Store;
        await scenario.Shell.OpenTrashAsync();
        var trash = Assert.IsType<TrashViewModel>(scenario.Shell.CurrentPage);
        await trash.RestoreAsync(trash.Batches[0]);
        await scenario.Shell.OpenSearchAsync();

        await scenario.Shell.ReturnFromSearchAsync();
        Assert.IsType<SearchViewModel>(scenario.Shell.CurrentPage);
        scenario.Dialogs.DraftResult = DraftDecision.Discard;
        await scenario.Shell.ReturnFromSearchAsync();

        Assert.Same(scenario.Workspace, scenario.Shell.CurrentPage);
        Assert.Contains(scenario.Workspace.OpenItems, row => row.Title == "Old task");
    }

    [Fact]
    public async Task Leaving_search_without_any_restore_does_not_reload_the_page_behind()
    {
        var scenario = await Scenario.CreateAsync(DraftDecision.Cancel);
        await using var store = scenario.Store;
        await scenario.Shell.OpenTrashAsync();
        await scenario.Shell.OpenSearchAsync();

        await scenario.Shell.ReturnFromSearchAsync();

        Assert.Same(scenario.Workspace, scenario.Shell.CurrentPage);
        Assert.Equal(0, scenario.Dialogs.DraftPromptCount);
    }

    [Fact]
    public async Task Back_is_ignored_while_a_restore_is_running_and_works_afterwards()
    {
        var fake = new FakeTrashService { RestoreGate = new TaskCompletionSource() };
        var scenario = await Scenario.CreateAsync(DraftDecision.Discard, trashOverride: fake);
        fake.Batches.Add(TrashBatches.Item("Slow", scenario.Workspace.ProjectId));
        await using var store = scenario.Store;
        await scenario.Shell.OpenTrashAsync();
        var trash = Assert.IsType<TrashViewModel>(scenario.Shell.CurrentPage);
        var restoring = trash.RestoreAsync(trash.Batches[0]);

        await scenario.Shell.ReturnFromTrashAsync();
        Assert.Same(trash, scenario.Shell.CurrentPage);
        fake.RestoreGate.SetResult();
        await restoring;
        await scenario.Shell.ReturnFromTrashAsync();

        Assert.Same(scenario.Workspace, scenario.Shell.CurrentPage);
        Assert.Equal(1, scenario.Dialogs.DraftPromptCount);
    }

    [Fact]
    public async Task A_restore_still_running_when_search_replaces_the_trash_is_refreshed_on_return()
    {
        var fake = new FakeTrashService { RestoreGate = new TaskCompletionSource() };
        var scenario = await Scenario.CreateAsync(DraftDecision.Discard, trashOverride: fake);
        fake.Batches.Add(TrashBatches.Item("Slow", scenario.Workspace.ProjectId));
        await using var store = scenario.Store;
        await scenario.Shell.OpenTrashAsync();
        var trash = Assert.IsType<TrashViewModel>(scenario.Shell.CurrentPage);
        var restoring = trash.RestoreAsync(trash.Batches[0]);
        await scenario.Shell.OpenSearchAsync();
        fake.RestoreGate.SetResult();
        await restoring;

        await scenario.Shell.ReturnFromSearchAsync();

        Assert.Same(scenario.Workspace, scenario.Shell.CurrentPage);
        Assert.Equal(1, scenario.Dialogs.DraftPromptCount);
    }

    [Fact]
    public async Task Back_after_restoring_a_project_from_home_shows_it_in_the_project_list()
    {
        var scenario = await Scenario.CreateAsync(DraftDecision.Cancel);
        await using var store = scenario.Store;
        var gone = await store.Projects.CreateAsync("Gone project");
        await store.Projects.DeleteAsync(gone.Id);
        await scenario.Shell.GoHomeAsync();
        var home = Assert.IsType<HomeViewModel>(scenario.Shell.CurrentPage);
        Assert.DoesNotContain(home.Cards, card => card.Name == "Gone project");
        await scenario.Shell.OpenTrashAsync();
        var trash = Assert.IsType<TrashViewModel>(scenario.Shell.CurrentPage);

        await trash.RestoreAsync(trash.Batches.Single(row => row.Title == "Gone project"));
        await scenario.Shell.ReturnFromTrashAsync();

        Assert.Same(home, scenario.Shell.CurrentPage);
        Assert.Contains(home.Cards, card => card.Name == "Gone project");
    }

    [Fact]
    public async Task Trash_still_loading_when_the_user_goes_home_is_not_shown_afterwards()
    {
        var scenario = await Scenario.CreateAsync(DraftDecision.Discard, gateTrash: true);
        await using var store = scenario.Store;
        var opening = scenario.Shell.OpenTrashAsync();

        await scenario.Shell.GoHomeAsync();
        scenario.TrashGate!.OpenGate();
        await opening;

        Assert.IsType<HomeViewModel>(scenario.Shell.CurrentPage);
    }

    /// <summary>A shell showing a project workspace with an unsaved title and one deleted item in the trash.</summary>
    private sealed class Scenario
    {
        private Scenario(PresentationTestStore store, MainWindowViewModel shell, FakeDialogService dialogs,
            ProjectWorkspaceViewModel workspace, GatedTrashUnitOfWorkFactory? trashGate)
        {
            Store = store;
            Shell = shell;
            Dialogs = dialogs;
            Workspace = workspace;
            TrashGate = trashGate;
        }

        public PresentationTestStore Store { get; }

        public MainWindowViewModel Shell { get; }

        public FakeDialogService Dialogs { get; }

        public ProjectWorkspaceViewModel Workspace { get; }

        public GatedTrashUnitOfWorkFactory? TrashGate { get; }

        public static async Task<Scenario> CreateAsync(DraftDecision decision, bool gateTrash = false,
            ITrashService? trashOverride = null)
        {
            var clock = new CountingTimerClock(NoonOnTheThirteenth);
            var store = new PresentationTestStore(clock);
            await store.InitializeAsync();
            var project = await store.Projects.CreateAsync("Billing");
            var item = await store.Items.CreateAsync(project.Id, null, null, "Review invoice");
            var old = await store.Items.CreateAsync(project.Id, null, null, "Old task");
            await store.Items.DeleteAsync(project.Id, null, old.Id);
            var dialogs = new FakeDialogService { DraftResult = decision };
            var gate = gateTrash ? new GatedTrashUnitOfWorkFactory(store.UnitOfWorkFactory) : null;
            var trash = trashOverride ?? (gate is null ? null : new TrashService(gate, clock));
            var shell = SearchTestShell.Create(store, dialogs, clock, trash: trash);
            await shell.OpenProjectAsync(project.Id);
            var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
            await workspace.SelectItemAsync(workspace.OpenItems.Single(row => row.Id == item.Id));
            workspace.Editor!.Title = "Draft title";
            return new Scenario(store, shell, dialogs, workspace, gate);
        }
    }
}