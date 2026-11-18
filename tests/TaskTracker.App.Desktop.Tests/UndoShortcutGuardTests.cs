using Avalonia;
using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Threading;
using Avalonia.VisualTree;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.Core.Projects;
using TaskTracker.Core.Undo;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>
/// When Ctrl+Z and Ctrl+Y must and must not run an application undo. A counting step records
/// whether the history was asked to undo, which happens synchronously inside the key press, so
/// none of these tests waits on a timer.
/// </summary>
public sealed class UndoShortcutGuardTests
{
    [AvaloniaFact]
    public async Task Ctrl_Z_after_leaving_a_priority_number_draft_refuses_application_undo()
    {
        using var scenario = await UndoScenario.OpenWorkspaceAsync();
        var step = new CountingStep();
        scenario.History.Record(step);
        await scenario.Shell.OpenAppSettingsAsync();
        Dispatcher.UIThread.RunJobs();
        var number = scenario.Window.GetVisualDescendants().OfType<TextBox>()
            .First(box => box.IsEffectivelyVisible && AutomationProperties.GetAutomationId(box) == "PriorityNumberBox");
        HeadlessInput.TypeInto(scenario.Window, number, "42");
        scenario.FocusButton("AppSettingsBackButton");
        Assert.IsType<Button>(scenario.Window.FocusManager!.GetFocusedElement());

        HeadlessInput.Press(scenario.Window, Key.Z, RawInputModifiers.Control);
        await HeadlessInput.WaitUntilAsync(() => scenario.Shell.Undo!.HasStatus);

        Assert.Equal("Save or discard your settings before undoing or redoing.", scenario.Shell.Undo!.Status);
        var dialog = Assert.Single(scenario.Window.OwnedWindows);
        Assert.Equal("Undo and redo", dialog.Title);
        HeadlessInput.Press(dialog, Key.Enter);
        Assert.Equal(0, step.UndoCount);
        Assert.Equal("42", Assert.IsType<LookupRowViewModel>(number.DataContext).Number);
    }

    [AvaloniaTheory]
    [InlineData("quick-add")]
    [InlineData("search")]
    [InlineData("date-picker")]
    [InlineData("editable-combo-box")]
    public async Task Ctrl_Z_in_a_text_input_does_not_trigger_application_undo(string input)
    {
        using var scenario = await UndoScenario.OpenWorkspaceAsync();
        var step = new CountingStep();
        scenario.History.Record(step);
        await FocusTextInputAsync(scenario, input);

        HeadlessInput.Press(scenario.Window, Key.Z, RawInputModifiers.Control);
        HeadlessInput.Press(scenario.Window, Key.Y, RawInputModifiers.Control);
        HeadlessInput.Press(scenario.Window, Key.Z, RawInputModifiers.Control | RawInputModifiers.Shift);

        Assert.Equal(0, step.UndoCount);
        Assert.Equal(0, step.RedoCount);
        Assert.True(scenario.History.CanUndo);
        Assert.False(scenario.Shell.Undo!.HasStatus);
    }

    [AvaloniaFact]
    public async Task Ctrl_Z_outside_a_text_input_does_trigger_application_undo()
    {
        using var scenario = await UndoScenario.OpenWorkspaceAsync();
        var step = new CountingStep();
        scenario.History.Record(step);
        scenario.FocusSomethingOtherThanATextBox();

        HeadlessInput.Press(scenario.Window, Key.Z, RawInputModifiers.Control);

        Assert.Equal(1, step.UndoCount);
    }

    [AvaloniaFact]
    public async Task Ctrl_Z_with_a_dialog_open_does_not_undo_and_leaves_the_dialog_open()
    {
        using var scenario = await UndoScenario.OpenWorkspaceAsync();
        var step = new CountingStep();
        scenario.History.Record(step);
        scenario.ClickTitle("Task");
        HeadlessInput.Press(scenario.Window, Key.Delete);
        var dialog = Assert.Single(scenario.Window.OwnedWindows);

        HeadlessInput.Press(dialog, Key.Z, RawInputModifiers.Control);

        Assert.Equal(0, step.UndoCount);
        Assert.Single(scenario.Window.OwnedWindows);
    }

    [AvaloniaFact]
    public async Task Ctrl_Z_with_an_empty_history_opens_no_message_box_on_any_screen()
    {
        using var scenario = await UndoScenario.OpenWorkspaceAsync();
        scenario.History.Clear();

        await scenario.Shell.GoHomeAsync();
        PressUndoAndRedo(scenario);
        await scenario.Shell.OpenCalendarAsync();
        PressUndoAndRedo(scenario);
        await scenario.Shell.OpenSearchAsync();
        PressUndoAndRedo(scenario);
        await scenario.Shell.OpenTrashAsync();
        PressUndoAndRedo(scenario);

        Assert.Empty(scenario.Window.OwnedWindows);
        Assert.False(scenario.Shell.Undo!.HasStatus);
    }

    [AvaloniaFact]
    public async Task Ctrl_Z_on_the_search_page_runs_the_query_again()
    {
        using var scenario = await UndoScenario.OpenWorkspaceAsync();
        await scenario.Items.DeleteAsync(scenario.ProjectId, null, scenario.ItemId);
        await scenario.Shell.OpenSearchAsync();
        var search = Assert.IsType<SearchViewModel>(scenario.Shell.CurrentPage);
        search.Text = "Task";
        await search.RunAsync();
        Assert.Empty(search.Results);
        scenario.FocusButton("SearchBackButton");

        HeadlessInput.Press(scenario.Window, Key.Z, RawInputModifiers.Control);
        await HeadlessInput.WaitUntilAsync(() => search.Results.Count == 1);

        Assert.Equal("Task", search.Results[0].Title);
    }

    [AvaloniaFact]
    public async Task Ctrl_Z_on_the_trash_page_refreshes_the_list()
    {
        using var scenario = await UndoScenario.OpenWorkspaceAsync();
        await scenario.Items.DeleteAsync(scenario.ProjectId, null, scenario.ItemId);
        await scenario.Shell.OpenTrashAsync();
        var trash = Assert.IsType<TrashViewModel>(scenario.Shell.CurrentPage);
        Assert.Single(trash.Batches);
        scenario.FocusButton("TrashBackButton");

        HeadlessInput.Press(scenario.Window, Key.Z, RawInputModifiers.Control);
        await HeadlessInput.WaitUntilAsync(() => trash.Batches.Count == 0);

        Assert.Empty(trash.Batches);
    }

    [AvaloniaFact]
    public async Task Ctrl_Z_on_home_brings_back_a_deleted_project()
    {
        using var scenario = await UndoScenario.OpenWorkspaceAsync();
        await scenario.Services.GetRequiredService<ProjectService>().DeleteAsync(scenario.ProjectId);
        await scenario.Shell.GoHomeAsync();
        var home = Assert.IsType<HomeViewModel>(scenario.Shell.CurrentPage);
        Assert.True(home.IsEmpty);

        HeadlessInput.Press(scenario.Window, Key.Z, RawInputModifiers.Control);
        await HeadlessInput.WaitUntilAsync(() => home.Cards.Count == 1);

        Assert.Equal("Project", home.Cards[0].Name);
    }

    [AvaloniaFact]
    public async Task Ctrl_Z_with_an_unsaved_draft_is_blocked_and_keeps_the_draft()
    {
        using var scenario = await UndoScenario.OpenWorkspaceAsync();
        var step = new CountingStep();
        scenario.History.Record(step);
        scenario.ClickTitle("Task");
        var title = HeadlessInput.Find<TextBox>(scenario.Window, "EditorTitleBox");
        HeadlessInput.TypeInto(scenario.Window, title, " draft");
        scenario.FocusSomethingOtherThanATextBox();

        HeadlessInput.Press(scenario.Window, Key.Z, RawInputModifiers.Control);
        await HeadlessInput.WaitUntilAsync(() => scenario.Shell.Undo!.HasStatus);

        Assert.Equal(0, step.UndoCount);
        Assert.Equal("Save or discard your item edits before undoing or redoing.", scenario.Shell.Undo!.Status);
        Assert.Contains("draft", title.Text);
        Assert.Equal("Save or discard your item edits before undoing or redoing.",
            HeadlessInput.Find<TextBlock>(scenario.Window, "WorkspaceUndoStatus").Text);
    }

    private static void PressUndoAndRedo(UndoScenario scenario)
    {
        Dispatcher.UIThread.RunJobs();
        HeadlessInput.Press(scenario.Window, Key.Z, RawInputModifiers.Control);
        HeadlessInput.Press(scenario.Window, Key.Y, RawInputModifiers.Control);
    }

    private static async Task FocusTextInputAsync(UndoScenario scenario, string input)
    {
        var box = await FindTextInputAsync(scenario, input);
        Assert.True(box.Focus(), "The text input could not take focus.");
        Dispatcher.UIThread.RunJobs();
        Assert.Same(box, scenario.Window.FocusManager!.GetFocusedElement());
    }

    private static async Task<TextBox> FindTextInputAsync(UndoScenario scenario, string input)
    {
        switch (input)
        {
            case "search":
                await scenario.Shell.OpenSearchAsync();
                Dispatcher.UIThread.RunJobs();
                return HeadlessInput.Find<TextBox>(scenario.Window, "SearchTextBox");
            case "date-picker":
                scenario.ClickTitle("Task");
                return FirstTextBoxIn(HeadlessInput.Find<CalendarDatePicker>(scenario.Window, "EditorDueDatePicker"));
            case "editable-combo-box":
                scenario.ClickTitle("Task");
                return MakeEditable(HeadlessInput.Find<ComboBox>(scenario.Window, "EditorTypeBox"), scenario.Window);
            default:
                return HeadlessInput.Find<TextBox>(scenario.Window, "QuickAddBox");
        }
    }

    private static TextBox MakeEditable(ComboBox comboBox, Window window)
    {
        comboBox.IsEditable = true;
        window.UpdateLayout();
        Dispatcher.UIThread.RunJobs();
        return FirstTextBoxIn(comboBox);
    }

    private static TextBox FirstTextBoxIn(Visual root)
    {
        return root.GetVisualDescendants().OfType<TextBox>().First();
    }

    private sealed class CountingStep : IUndoableChange
    {
        public int UndoCount { get; private set; }

        public int RedoCount { get; private set; }

        public string Description => "Counting step";

        public Task UndoAsync(CancellationToken cancellationToken = default)
        {
            UndoCount++;
            return Task.CompletedTask;
        }

        public Task RedoAsync(CancellationToken cancellationToken = default)
        {
            RedoCount++;
            return Task.CompletedTask;
        }
    }
}