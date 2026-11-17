using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Threading;
using Avalonia.VisualTree;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Undo;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>Undo and redo driven by simulated keyboard and mouse input in the real window.</summary>
public sealed class UndoInputTests
{
    private const RawInputModifiers CtrlShift = RawInputModifiers.Control | RawInputModifiers.Shift;

    [AvaloniaFact]
    public async Task Ctrl_Z_and_Ctrl_Y_undo_and_redo_a_completion()
    {
        using var scenario = await UndoScenario.OpenWorkspaceAsync();
        await scenario.Items.SetCompletedAsync(scenario.ProjectId, null, scenario.ItemId, true);
        scenario.FocusSomethingOtherThanATextBox();

        HeadlessInput.Press(scenario.Window, Key.Z, RawInputModifiers.Control);
        await HeadlessInput.WaitUntilAsync(() => scenario.History.CanRedo);

        Assert.Null(await scenario.ReadCompletionAsync());

        HeadlessInput.Press(scenario.Window, Key.Y, RawInputModifiers.Control);
        await HeadlessInput.WaitUntilAsync(() => !scenario.History.CanRedo);

        Assert.NotNull(await scenario.ReadCompletionAsync());
    }

    [AvaloniaFact]
    public async Task Ctrl_Shift_Z_redoes_like_Ctrl_Y()
    {
        using var scenario = await UndoScenario.OpenWorkspaceAsync();
        await scenario.Items.SetCompletedAsync(scenario.ProjectId, null, scenario.ItemId, true);
        scenario.FocusSomethingOtherThanATextBox();
        HeadlessInput.Press(scenario.Window, Key.Z, RawInputModifiers.Control);
        await HeadlessInput.WaitUntilAsync(() => scenario.History.CanRedo);

        HeadlessInput.Press(scenario.Window, Key.Z, CtrlShift);
        await HeadlessInput.WaitUntilAsync(() => !scenario.History.CanRedo);

        Assert.NotNull(await scenario.ReadCompletionAsync());
    }

    [AvaloniaFact]
    public async Task Ctrl_Z_undoes_an_Alt_Down_reorder_and_Ctrl_Y_reapplies_it()
    {
        using var scenario = await UndoScenario.OpenWorkspaceAsync();
        await scenario.Items.CreateAsync(scenario.ProjectId, null, null, "Second");
        await scenario.Workspace.LoadAsync();
        scenario.ClickTitle("Task");

        HeadlessInput.Press(scenario.Window, Key.Down, RawInputModifiers.Alt);
        await HeadlessInput.WaitUntilAsync(() => scenario.OpenTitles() == "Second,Task");
        HeadlessInput.Press(scenario.Window, Key.Z, RawInputModifiers.Control);
        await HeadlessInput.WaitUntilAsync(() => scenario.OpenTitles() == "Task,Second");

        Assert.Equal("Undid: Reorder items", scenario.Shell.Undo!.Status);

        HeadlessInput.Press(scenario.Window, Key.Y, RawInputModifiers.Control);
        await HeadlessInput.WaitUntilAsync(() => scenario.OpenTitles() == "Second,Task");
    }

    [AvaloniaFact]
    public async Task Ctrl_Z_brings_back_an_item_deleted_with_the_Delete_key()
    {
        using var scenario = await UndoScenario.OpenWorkspaceAsync();
        scenario.ClickTitle("Task");
        scenario.Window.KeyPress(Key.Delete, RawInputModifiers.None, PhysicalKey.None, null);
        var dialog = Assert.Single(scenario.Window.OwnedWindows);
        dialog.KeyPress(Key.Enter, RawInputModifiers.None, PhysicalKey.None, null);
        await HeadlessInput.WaitUntilAsync(() => scenario.OpenTitles() == string.Empty);

        HeadlessInput.Press(scenario.Window, Key.Z, RawInputModifiers.Control);
        await HeadlessInput.WaitUntilAsync(() => scenario.OpenTitles() == "Task");

        Assert.Equal("Undid: Delete 'Task'", scenario.Shell.Undo!.Status);
    }

    [AvaloniaFact]
    public async Task Ctrl_Z_undoes_a_calendar_reschedule()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        var services = await TestServices.CreateAsync(window);
        using var scenario = await UndoScenario.OpenWorkspaceAsync(services, window, withDueDate: true);
        HeadlessInput.Press(window, Key.C, CtrlShift);
        var calendar = Assert.IsType<CalendarViewModel>(scenario.Shell.CurrentPage);
        await HeadlessInput.WaitUntilAsync(() => calendar.Days.Count == 42);
        HeadlessInput.Find<Button>(window, "CalendarEntryButton").Focus();
        HeadlessInput.Press(window, Key.Right, RawInputModifiers.Alt);
        await HeadlessInput.WaitUntilAsync(() => scenario.EntryDay(calendar) == UndoScenario.DayAfter);

        HeadlessInput.Press(window, Key.Z, RawInputModifiers.Control);
        await HeadlessInput.WaitUntilAsync(() => scenario.EntryDay(calendar) == UndoScenario.DueDay);

        Assert.Equal(UndoScenario.DueDay, scenario.EntryDay(calendar));
    }


    [AvaloniaFact]
    public async Task Undo_and_redo_buttons_show_tooltips_and_work_with_the_mouse()
    {
        using var scenario = await UndoScenario.OpenWorkspaceAsync();
        var undo = HeadlessInput.Find<Button>(scenario.Window, "WorkspaceUndoButton");
        var redo = HeadlessInput.Find<Button>(scenario.Window, "WorkspaceRedoButton");
        Assert.False(undo.IsEffectivelyEnabled);
        Assert.False(redo.IsEffectivelyEnabled);

        await scenario.Items.SetCompletedAsync(scenario.ProjectId, null, scenario.ItemId, true);
        Dispatcher.UIThread.RunJobs();

        Assert.True(undo.IsEffectivelyEnabled);
        Assert.Equal("Undo: Complete 'Task'", ToolTip.GetTip(undo));
        HeadlessInput.Click(scenario.Window, undo);
        await HeadlessInput.WaitUntilAsync(() => scenario.History.CanRedo);

        Assert.Null(await scenario.ReadCompletionAsync());
        Assert.True(redo.IsEffectivelyEnabled);
        Assert.Equal("Redo: Complete 'Task'", ToolTip.GetTip(redo));
        Assert.Equal("Undid: Complete 'Task'", HeadlessInput.Find<TextBlock>(scenario.Window, "WorkspaceUndoStatus").Text);

        HeadlessInput.Click(scenario.Window, redo);
        await HeadlessInput.WaitUntilAsync(() => !scenario.History.CanRedo);

        Assert.NotNull(await scenario.ReadCompletionAsync());
    }
}