#pragma warning disable xUnit1051
using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Undo;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>Undo and redo through the shell: commands, labels, status messages and screen reloads.</summary>
public sealed class MainWindowViewModelUndoTests
{
    private static readonly DateTimeOffset NoonOnTheThirteenth = new(2026, 11, 13, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Undo_and_redo_are_disabled_until_there_is_something_to_undo_or_redo()
    {
        await using var scenario = await Scenario.CreateAsync();

        Assert.False(scenario.Shell.Undo!.UndoCommand.CanExecute(null));
        Assert.False(scenario.Shell.Undo!.RedoCommand.CanExecute(null));
        Assert.Equal("Undo", scenario.Shell.Undo!.UndoTooltip);

        await scenario.Store.Items.SetCompletedAsync(scenario.Project.Id, null, scenario.First.Id, true);

        Assert.True(scenario.Shell.Undo!.UndoCommand.CanExecute(null));
        Assert.False(scenario.Shell.Undo!.RedoCommand.CanExecute(null));

        await scenario.Shell.Undo!.UndoAsync();

        Assert.False(scenario.Shell.Undo!.UndoCommand.CanExecute(null));
        Assert.True(scenario.Shell.Undo!.RedoCommand.CanExecute(null));
    }

    [Fact]
    public async Task Tooltips_name_the_action_that_would_be_undone_or_redone()
    {
        await using var scenario = await Scenario.CreateAsync();
        await scenario.Store.Items.SetCompletedAsync(scenario.Project.Id, null, scenario.First.Id, true);

        Assert.Equal("Undo: Complete 'First'", scenario.Shell.Undo!.UndoTooltip);
        Assert.Equal("Redo", scenario.Shell.Undo!.RedoTooltip);

        await scenario.Shell.Undo!.UndoAsync();

        Assert.Equal("Undo", scenario.Shell.Undo!.UndoTooltip);
        Assert.Equal("Redo: Complete 'First'", scenario.Shell.Undo!.RedoTooltip);
    }

    [Fact]
    public async Task Undo_and_redo_report_what_they_did_and_reload_the_workspace()
    {
        await using var scenario = await Scenario.CreateAsync();
        await scenario.Store.Items.SetCompletedAsync(scenario.Project.Id, null, scenario.First.Id, true);
        await scenario.Workspace.LoadAsync();
        Assert.Equal(["Second"], scenario.Workspace.OpenItems.Select(row => row.Title));

        await scenario.Shell.Undo!.UndoAsync();

        Assert.Equal("Undid: Complete 'First'", scenario.Shell.Undo!.Status);
        Assert.Equal(["First", "Second"], scenario.Workspace.OpenItems.Select(row => row.Title));
        Assert.Empty(scenario.Workspace.CompletedItems);

        await scenario.Shell.Undo!.RedoAsync();

        Assert.Equal("Redid: Complete 'First'", scenario.Shell.Undo!.Status);
        Assert.Equal(["First"], scenario.Workspace.CompletedItems.Select(row => row.Title));
    }

    [Fact]
    public async Task A_new_action_clears_the_status_message()
    {
        await using var scenario = await Scenario.CreateAsync();
        await scenario.Store.Items.SetCompletedAsync(scenario.Project.Id, null, scenario.First.Id, true);
        await scenario.Shell.Undo!.UndoAsync();

        await scenario.Store.Items.CreateAsync(scenario.Project.Id, null, null, "Third");

        Assert.Null(scenario.Shell.Undo!.Status);
    }

    [Fact]
    public async Task Undo_keeps_the_selected_folder_and_item_when_they_still_exist()
    {
        await using var scenario = await Scenario.CreateAsync();
        var folder = await scenario.Store.Folders.CreateAsync(scenario.Project.Id, null, "Area");
        var inside = await scenario.Store.Items.CreateAsync(scenario.Project.Id, folder.Id, null, "Inside");
        await scenario.Workspace.LoadAsync(folder.Id, inside.Id);
        await scenario.Store.Items.CreateAsync(scenario.Project.Id, folder.Id, null, "Added");

        await scenario.Shell.Undo!.UndoAsync();

        Assert.Equal(folder.Id, scenario.Workspace.SelectedFolder?.Id);
        Assert.Equal("Inside", scenario.Workspace.Editor?.Title);
        Assert.Equal(["Inside"], scenario.Workspace.OpenItems.Select(row => row.Title));
    }

    [Fact]
    public async Task Undoing_the_creation_of_the_selected_item_clears_the_selection_without_failing()
    {
        await using var scenario = await Scenario.CreateAsync();
        var created = await scenario.Store.Items.CreateAsync(scenario.Project.Id, null, null, "Third");
        await scenario.Workspace.LoadAsync(null, created.Id);
        Assert.Equal("Third", scenario.Workspace.Editor?.Title);

        await scenario.Shell.Undo!.UndoAsync();

        Assert.Null(scenario.Workspace.Editor);
        Assert.Equal("Undid: Create 'Third'", scenario.Shell.Undo!.Status);
    }

    [Fact]
    public async Task Undo_is_blocked_with_a_message_while_the_editor_has_an_unsaved_draft()
    {
        await using var scenario = await Scenario.CreateAsync();
        await scenario.Store.Items.SetCompletedAsync(scenario.Project.Id, null, scenario.Second.Id, true);
        await scenario.Workspace.LoadAsync(null, scenario.First.Id);
        scenario.Workspace.Editor!.Title = "Draft title";

        await scenario.Shell.Undo!.UndoAsync();

        Assert.Equal("Save or discard your item edits before undoing or redoing.", scenario.Shell.Undo!.Status);
        Assert.Equal("Draft title", scenario.Workspace.Editor?.Title);
        Assert.True(scenario.Shell.Undo!.UndoCommand.CanExecute(null));
        Assert.Equal(["Second"], scenario.Workspace.CompletedItems.Select(row => row.Title));
        Assert.Equal(0, scenario.Dialogs.DraftPromptCount);
    }

    [Fact]
    public async Task A_refused_step_shows_the_conflict_message_in_the_workspace()
    {
        await using var scenario = await Scenario.CreateAsync();
        await scenario.Store.Items.EditAsync(scenario.First.Id, Plain("Edited"));
        await RenameBehindTheHistoryAsync(scenario, scenario.First.Id, "External");

        await scenario.Shell.Undo!.UndoAsync();

        Assert.Equal("This item changed since; can't undo.", scenario.Shell.Undo!.Status);
        Assert.Empty(scenario.Dialogs.Messages);
        Assert.True(scenario.Shell.Undo!.UndoCommand.CanExecute(null));
    }

    [Fact]
    public async Task Undo_on_the_calendar_reloads_it_and_the_workspace_behind_it()
    {
        await using var scenario = await Scenario.CreateAsync();
        var today = new DateOnly(2026, 11, 13);
        await scenario.Store.Items.EditAsync(scenario.First.Id, Plain("First", due: today));
        await scenario.Store.Items.EditAsync(scenario.First.Id, Plain("First", due: today.AddDays(1)));
        await scenario.Shell.OpenCalendarAsync();
        var calendar = Assert.IsType<CalendarViewModel>(scenario.Shell.CurrentPage);

        await scenario.Shell.Undo!.UndoAsync();

        var entry = Assert.Single(calendar.Days.SelectMany(day => day.Entries));
        Assert.Equal(today, entry.Day);

        await scenario.Shell.ReturnFromCalendarAsync();

        var workspace = Assert.IsType<ProjectWorkspaceViewModel>(scenario.Shell.CurrentPage);
        Assert.Equal(today, workspace.OpenItems.Single(row => row.Id == scenario.First.Id).Node.Item.DueDate);
    }

    [Fact]
    public async Task Undo_on_the_trash_page_reloads_the_list_of_deleted_items()
    {
        await using var scenario = await Scenario.CreateAsync();
        await scenario.Store.Items.DeleteAsync(scenario.Project.Id, null, scenario.Second.Id);
        await scenario.Shell.OpenTrashAsync();
        var trash = Assert.IsType<TrashViewModel>(scenario.Shell.CurrentPage);
        Assert.Single(trash.Batches);

        await scenario.Shell.Undo!.UndoAsync();

        Assert.Empty(trash.Batches);
    }

    [Fact]
    public async Task A_refusal_outside_the_workspace_is_shown_in_a_message_box()
    {
        await using var scenario = await Scenario.CreateAsync();
        await scenario.Store.Items.EditAsync(scenario.First.Id, Plain("Edited"));
        await RenameBehindTheHistoryAsync(scenario, scenario.First.Id, "External");
        await scenario.Shell.OpenTrashAsync();

        await scenario.Shell.Undo!.UndoAsync();

        Assert.Equal("This item changed since; can't undo.", Assert.Single(scenario.Dialogs.Messages));
    }

    [Fact]
    public async Task Undoing_a_project_deletion_brings_the_project_back_on_home()
    {
        await using var scenario = await Scenario.CreateAsync();
        await scenario.Store.Projects.DeleteAsync(scenario.Project.Id);
        await scenario.Shell.GoHomeAsync();
        var home = Assert.IsType<HomeViewModel>(scenario.Shell.CurrentPage);
        Assert.True(home.IsEmpty);

        await scenario.Shell.Undo!.UndoAsync();

        Assert.Equal("Billing", Assert.Single(home.Cards).Name);
        Assert.Equal("Undid: Delete 'Billing'", scenario.Shell.Undo!.Status);
    }

    [Fact]
    public async Task Undo_on_the_search_page_runs_the_query_again()
    {
        await using var scenario = await Scenario.CreateAsync();
        await scenario.Store.Items.DeleteAsync(scenario.Project.Id, null, scenario.Second.Id);
        await scenario.Shell.OpenSearchAsync();
        var search = Assert.IsType<SearchViewModel>(scenario.Shell.CurrentPage);
        search.Text = "Second";
        await search.RunAsync();
        Assert.Empty(search.Results);

        await scenario.Shell.Undo!.UndoAsync();

        Assert.Equal("Second", Assert.Single(search.Results).Title);
    }

    [Fact]
    public async Task Going_to_another_screen_clears_the_undo_status()
    {
        await using var scenario = await Scenario.CreateAsync();
        await scenario.Store.Items.SetCompletedAsync(scenario.Project.Id, null, scenario.First.Id, true);
        await scenario.Shell.Undo!.UndoAsync();
        Assert.True(scenario.Shell.Undo.HasStatus);

        await scenario.Shell.GoHomeAsync();
        await scenario.Shell.OpenProjectAsync(scenario.Project.Id);

        Assert.False(scenario.Shell.Undo.HasStatus);
    }

    [Fact]
    public async Task Undo_with_nothing_to_undo_shows_no_message_box()
    {
        await using var scenario = await Scenario.CreateAsync();
        await scenario.Shell.GoHomeAsync();

        await scenario.Shell.Undo!.UndoAsync();
        await scenario.Shell.Undo.RedoAsync();

        Assert.Empty(scenario.Dialogs.Messages);
    }

    [Fact]
    public async Task An_unexpected_failure_while_undoing_is_reported_in_a_message_box()
    {
        await using var scenario = await Scenario.CreateAsync();
        scenario.Store.History.Record(new CrashingStep());

        await scenario.Shell.Undo!.UndoAsync();

        Assert.Contains("Boom", Assert.Single(scenario.Dialogs.Messages));
        Assert.True(scenario.Store.History.CanUndo);
    }

    private static ItemEdit Plain(string title, DateOnly? due = null)
    {
        return new ItemEdit(title, null, null, null, null, due, null, null, null);
    }

    private static async Task RenameBehindTheHistoryAsync(Scenario scenario, Guid itemId, string title)
    {
        await scenario.Store.UnrecordedItems.EditAsync(itemId, Plain(title));
    }


    private sealed class CrashingStep : IUndoableChange
    {
        public string Description => "Crash";

        public Task UndoAsync(CancellationToken cancellationToken = default)
        {
            throw new InvalidOperationException("Boom");
        }

        public Task RedoAsync(CancellationToken cancellationToken = default)
        {
            throw new InvalidOperationException("Boom");
        }
    }

    private sealed class Scenario : IAsyncDisposable
    {
        private Scenario(PresentationTestStore store, MainWindowViewModel shell, FakeDialogService dialogs,
            ProjectWorkspaceViewModel workspace, Project project, TodoItem first, TodoItem second)
        {
            Store = store;
            Shell = shell;
            Dialogs = dialogs;
            Workspace = workspace;
            Project = project;
            First = first;
            Second = second;
        }

        public PresentationTestStore Store { get; }

        public MainWindowViewModel Shell { get; }

        public FakeDialogService Dialogs { get; }

        public ProjectWorkspaceViewModel Workspace { get; }

        public Project Project { get; }

        public TodoItem First { get; }

        public TodoItem Second { get; }

        public static async Task<Scenario> CreateAsync()
        {
            var clock = new FakeTimeProvider(NoonOnTheThirteenth);
            var store = new PresentationTestStore(clock);
            await store.InitializeAsync();
            var project = await store.Projects.CreateAsync("Billing");
            var first = await store.Items.CreateAsync(project.Id, null, null, "First");
            var second = await store.Items.CreateAsync(project.Id, null, null, "Second");
            var dialogs = new FakeDialogService();
            var shell = SearchTestShell.Create(store, dialogs, clock);
            await shell.OpenProjectAsync(project.Id);
            var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
            store.History.Clear();
            return new Scenario(store, shell, dialogs, workspace, project, first, second);
        }

        public async ValueTask DisposeAsync()
        {
            await Store.DisposeAsync();
        }
    }
}