#pragma warning disable xUnit1051
using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Calendar;
using TaskTracker.Core.Items;
using TaskTracker.Presentation.Navigation;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>Shell navigation between the calendar, search and the pages behind them.</summary>
public sealed class MainWindowViewModelCalendarTests
{
    private static readonly DateTimeOffset NoonOnTheThirteenth = new(2026, 11, 13, 12, 0, 0, TimeSpan.Zero);

    private static readonly DateOnly TheThirteenth = new(2026, 11, 13);

    [Fact]
    public async Task Search_then_Calendar_keeps_asking_the_workspace_before_an_entry_opens()
    {
        var scenario = await Scenario.CreateAsync(DraftDecision.Cancel);
        await using var store = scenario.Store;
        await scenario.OpenSearchThenCalendarAsync();

        var outcome = await scenario.Shell.OpenCalendarItemAsync(scenario.ItemId);

        Assert.Equal(SearchOpenOutcome.Cancelled, outcome);
        Assert.IsType<CalendarViewModel>(scenario.Shell.CurrentPage);
        Assert.Equal(1, scenario.Dialogs.DraftPromptCount);
        Assert.Equal("Draft title", scenario.Workspace.Editor?.Title);
    }

    [Fact]
    public async Task Calendar_then_Search_keeps_asking_the_workspace_before_a_result_opens()
    {
        var scenario = await Scenario.CreateAsync(DraftDecision.Cancel);
        await using var store = scenario.Store;
        await scenario.OpenCalendarThenSearchAsync();
        var search = Assert.IsType<SearchViewModel>(scenario.Shell.CurrentPage);

        await search.OpenResultAsync(Assert.Single(search.Results));

        Assert.Same(search, scenario.Shell.CurrentPage);
        Assert.Equal(1, scenario.Dialogs.DraftPromptCount);
        Assert.Null(search.Error);
        Assert.Equal("Draft title", scenario.Workspace.Editor?.Title);
    }

    [Theory]
    [InlineData(DraftDecision.Discard, "Review invoice")]
    [InlineData(DraftDecision.Save, "Draft title")]
    public async Task Search_then_Calendar_entry_opens_after_the_draft_is_resolved(
        DraftDecision decision, string expectedTitle)
    {
        var scenario = await Scenario.CreateAsync(decision);
        await using var store = scenario.Store;
        await scenario.OpenSearchThenCalendarAsync();

        var outcome = await scenario.Shell.OpenCalendarItemAsync(scenario.ItemId);

        Assert.Equal(SearchOpenOutcome.Opened, outcome);
        var opened = Assert.IsType<ProjectWorkspaceViewModel>(scenario.Shell.CurrentPage);
        Assert.Equal(expectedTitle, opened.Editor?.Title);
        Assert.Equal(1, scenario.Dialogs.DraftPromptCount);
    }

    [Theory]
    [InlineData(DraftDecision.Discard, "Review invoice")]
    [InlineData(DraftDecision.Save, "Draft title")]
    public async Task Calendar_then_Search_result_opens_after_the_draft_is_resolved(
        DraftDecision decision, string expectedTitle)
    {
        var scenario = await Scenario.CreateAsync(decision);
        await using var store = scenario.Store;
        await scenario.OpenCalendarThenSearchAsync();
        var search = Assert.IsType<SearchViewModel>(scenario.Shell.CurrentPage);

        await search.OpenResultAsync(Assert.Single(search.Results));

        var opened = Assert.IsType<ProjectWorkspaceViewModel>(scenario.Shell.CurrentPage);
        Assert.Equal(expectedTitle, opened.Editor?.Title);
    }

    [Theory]
    [InlineData(DraftDecision.Cancel, SearchOpenOutcome.Cancelled)]
    [InlineData(DraftDecision.Discard, SearchOpenOutcome.Opened)]
    [InlineData(DraftDecision.Save, SearchOpenOutcome.Opened)]
    public async Task Entry_activation_from_the_calendar_asks_the_workspace_draft_first(
        DraftDecision decision, SearchOpenOutcome expected)
    {
        var scenario = await Scenario.CreateAsync(decision);
        await using var store = scenario.Store;
        await scenario.Shell.OpenCalendarAsync();
        var calendar = Assert.IsType<CalendarViewModel>(scenario.Shell.CurrentPage);
        var entry = calendar.Days.SelectMany(day => day.Entries).Single();

        await calendar.OpenEntryAsync(entry);

        var expectedPage = expected == SearchOpenOutcome.Opened ? typeof(ProjectWorkspaceViewModel) : typeof(CalendarViewModel);
        Assert.IsType(expectedPage, scenario.Shell.CurrentPage);
        Assert.Equal(1, scenario.Dialogs.DraftPromptCount);
    }

    [Fact]
    public async Task Back_from_a_calendar_opened_through_search_returns_to_the_original_workspace()
    {
        var scenario = await Scenario.CreateAsync(DraftDecision.Cancel);
        await using var store = scenario.Store;
        await scenario.OpenSearchThenCalendarAsync();

        await scenario.Shell.ReturnFromCalendarAsync();

        Assert.Same(scenario.Workspace, scenario.Shell.CurrentPage);
        Assert.Equal("Draft title", scenario.Workspace.Editor?.Title);
    }

    [Fact]
    public async Task Back_from_a_search_opened_through_the_calendar_returns_to_the_original_workspace()
    {
        var scenario = await Scenario.CreateAsync(DraftDecision.Cancel);
        await using var store = scenario.Store;
        await scenario.OpenCalendarThenSearchAsync();

        await scenario.Shell.ReturnFromSearchAsync();

        Assert.Same(scenario.Workspace, scenario.Shell.CurrentPage);
        Assert.Equal("Draft title", scenario.Workspace.Editor?.Title);
    }

    [Fact]
    public async Task Opening_search_from_the_calendar_disposes_the_calendar()
    {
        var scenario = await Scenario.CreateAsync(DraftDecision.Cancel);
        await using var store = scenario.Store;
        var timersWithWorkspace = scenario.Clock.ActiveTimers;
        await scenario.Shell.OpenCalendarAsync();
        Assert.Equal(timersWithWorkspace + 1, scenario.Clock.ActiveTimers);

        await scenario.Shell.OpenSearchAsync();

        Assert.Equal(timersWithWorkspace, scenario.Clock.ActiveTimers);
    }

    [Fact]
    public async Task Calendar_opened_from_search_scopes_to_the_workspace_behind_the_search()
    {
        var scenario = await Scenario.CreateAsync(DraftDecision.Cancel);
        await using var store = scenario.Store;
        await scenario.Shell.OpenSearchAsync();

        await scenario.Shell.OpenCalendarAsync();

        var calendar = Assert.IsType<CalendarViewModel>(scenario.Shell.CurrentPage);
        Assert.Equal(CalendarViewModel.ThisProjectScope, calendar.SelectedScope);
    }

    [Fact]
    public async Task Entry_activation_still_pending_when_the_calendar_is_left_opens_nothing()
    {
        var scenario = await Scenario.CreateAsync(DraftDecision.Discard);
        await using var store = scenario.Store;
        scenario.Dialogs.DraftGate = new TaskCompletionSource<DraftDecision>();
        await scenario.Shell.OpenCalendarAsync();
        var activation = scenario.Shell.OpenCalendarItemAsync(scenario.ItemId);
        await WaitForDraftQuestionAsync(scenario.Dialogs);

        await scenario.Shell.ReturnFromCalendarAsync();
        scenario.Dialogs.DraftGate.SetResult(DraftDecision.Discard);
        var outcome = await activation;

        Assert.Equal(SearchOpenOutcome.Cancelled, outcome);
        Assert.Same(scenario.Workspace, scenario.Shell.CurrentPage);
    }

    [Fact]
    public async Task Calendar_still_loading_when_the_user_goes_home_is_not_shown_afterwards()
    {
        var scenario = await Scenario.CreateAsync(DraftDecision.Discard, gateCalendar: true);
        await using var store = scenario.Store;
        var opening = scenario.Shell.OpenCalendarAsync();

        await scenario.Shell.GoHomeAsync();
        scenario.CalendarGate!.OpenGate();
        await opening;

        Assert.IsType<HomeViewModel>(scenario.Shell.CurrentPage);
        Assert.Equal(0, scenario.Clock.ActiveTimers);
    }

    [Fact]
    public async Task Calendar_opened_twice_in_a_row_does_not_stack_pages()
    {
        var scenario = await Scenario.CreateAsync(DraftDecision.Cancel);
        await using var store = scenario.Store;

        await scenario.Shell.OpenCalendarAsync();
        var first = scenario.Shell.CurrentPage;
        await scenario.Shell.OpenCalendarAsync();

        Assert.Same(first, scenario.Shell.CurrentPage);
        await scenario.Shell.ReturnFromCalendarAsync();
        Assert.Same(scenario.Workspace, scenario.Shell.CurrentPage);
    }

    private static async Task WaitForDraftQuestionAsync(FakeDialogService dialogs)
    {
        for (var attempt = 0; attempt < 500 && dialogs.DraftPromptCount == 0; attempt++)
        {
            await Task.Delay(10);
        }

        Assert.Equal(1, dialogs.DraftPromptCount);
    }

    /// <summary>A shell showing a project workspace whose editor holds an unsaved title.</summary>
    private sealed class Scenario
    {
        private Scenario(PresentationTestStore store, MainWindowViewModel shell, FakeDialogService dialogs,
            CountingTimerClock clock, ProjectWorkspaceViewModel workspace, Guid itemId,
            GatedCalendarUnitOfWorkFactory? calendarGate)
        {
            Store = store;
            Shell = shell;
            Dialogs = dialogs;
            Clock = clock;
            Workspace = workspace;
            ItemId = itemId;
            CalendarGate = calendarGate;
        }

        public PresentationTestStore Store { get; }

        public MainWindowViewModel Shell { get; }

        public FakeDialogService Dialogs { get; }

        public CountingTimerClock Clock { get; }

        public ProjectWorkspaceViewModel Workspace { get; }

        public Guid ItemId { get; }

        public GatedCalendarUnitOfWorkFactory? CalendarGate { get; }

        public static async Task<Scenario> CreateAsync(DraftDecision decision, bool gateCalendar = false)
        {
            var clock = new CountingTimerClock(NoonOnTheThirteenth);
            var store = new PresentationTestStore(clock);
            await store.InitializeAsync();
            var project = await store.Projects.CreateAsync("Billing");
            var item = await store.Items.CreateAsync(project.Id, null, null, "Review invoice");
            await store.Items.EditAsync(item.Id, new ItemEdit(item.Title, null, null, null, null,
                TheThirteenth, null, null, null));
            var dialogs = new FakeDialogService { DraftResult = decision };
            var gate = gateCalendar ? new GatedCalendarUnitOfWorkFactory(store.UnitOfWorkFactory) : null;
            var calendar = gate is null ? null : new CalendarService(gate);
            var shell = SearchTestShell.Create(store, dialogs, clock, calendar: calendar);
            await shell.OpenProjectAsync(project.Id);
            var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
            await workspace.SelectItemAsync(workspace.OpenItems.Single(row => row.Id == item.Id));
            workspace.Editor!.Title = "Draft title";
            return new Scenario(store, shell, dialogs, clock, workspace, item.Id, gate);
        }

        public async Task OpenSearchThenCalendarAsync()
        {
            await Shell.OpenSearchAsync();
            await Shell.OpenCalendarAsync();
            Assert.IsType<CalendarViewModel>(Shell.CurrentPage);
        }

        public async Task OpenCalendarThenSearchAsync()
        {
            await Shell.OpenCalendarAsync();
            await Shell.OpenSearchAsync();
            var search = Assert.IsType<SearchViewModel>(Shell.CurrentPage);
            search.Text = "invoice";
            await search.RunAsync();
        }
    }
}