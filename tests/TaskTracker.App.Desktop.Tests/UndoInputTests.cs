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
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Settings;
using TaskTracker.Core.Undo;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>Undo and redo driven by simulated keyboard and mouse input in the real window.</summary>
public sealed class UndoInputTests
{
    private const RawInputModifiers CtrlShift = RawInputModifiers.Control | RawInputModifiers.Shift;

    [AvaloniaFact]
    public async Task Ctrl_Z_restores_the_project_name_after_renaming_from_home()
    {
        using var scenario = await UndoScenario.OpenWorkspaceAsync();
        var window = scenario.Window;
        await scenario.Shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();
        var home = Assert.IsType<HomeViewModel>(scenario.Shell.CurrentPage);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "RenameProjectButton"));
        var dialog = Assert.Single(window.OwnedWindows);
        dialog.KeyTextInput("Renamed");
        HeadlessInput.Press(dialog, Key.Enter);
        await HeadlessInput.WaitUntilAsync(() => home.Cards.Single().Name == "Renamed");

        HeadlessInput.Find<MenuItem>(window, "ProjectMenu").Focus();
        HeadlessInput.Press(window, Key.Z, RawInputModifiers.Control);
        await HeadlessInput.WaitUntilAsync(() => home.Cards.Single().Name == "Project");

        Assert.Equal("Undid: Rename 'Renamed'", scenario.Shell.Undo!.Status);
    }

    [AvaloniaFact]
    public async Task Ctrl_Z_restores_a_priority_after_archiving_in_app_settings()
    {
        using var scenario = await UndoScenario.OpenWorkspaceAsync();
        var window = scenario.Window;
        await scenario.Shell.OpenAppSettingsAsync();
        Dispatcher.UIThread.RunJobs();
        var page = Assert.IsType<AppSettingsViewModel>(scenario.Shell.CurrentPage);
        var archive = window.GetVisualDescendants().OfType<Button>().Single(button =>
            AutomationProperties.GetAutomationId(button) == "LookupArchiveButton"
            && button.DataContext is LookupRowViewModel row && row.Id == BuiltInLookups.CriticalId);

        HeadlessInput.Click(window, archive);
        await HeadlessInput.WaitUntilAsync(() => page.PriorityLevels!.Archived.Any(row => row.Id == BuiltInLookups.CriticalId));
        HeadlessInput.Find<Button>(window, "AppSettingsBackButton").Focus();
        HeadlessInput.Press(window, Key.Z, RawInputModifiers.Control);

        await HeadlessInput.WaitUntilAsync(() => page.PriorityLevels!.Active.Any(row => row.Id == BuiltInLookups.CriticalId));
        Assert.Equal("Undid: Archive priority 'Critical'", scenario.Shell.Undo!.Status);
    }

    [AvaloniaFact]
    public async Task Ctrl_Z_restores_a_saved_setting_and_refreshes_the_form()
    {
        using var scenario = await UndoScenario.OpenWorkspaceAsync();
        var window = scenario.Window;
        await scenario.Shell.OpenAppSettingsAsync();
        Dispatcher.UIThread.RunJobs();
        var page = Assert.IsType<AppSettingsViewModel>(scenario.Shell.CurrentPage);
        var autoComplete = HeadlessInput.Find<CheckBox>(window, "GlobalAutoCompleteCheckBox");
        HeadlessInput.Click(window, autoComplete);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "AppSettingsSaveButton"));
        await HeadlessInput.WaitUntilAsync(() => !page.IsDirty && !page.AutoCompleteParents);

        HeadlessInput.Find<Button>(window, "AppSettingsBackButton").Focus();
        HeadlessInput.Press(window, Key.Z, RawInputModifiers.Control);
        await HeadlessInput.WaitUntilAsync(() => !page.IsDirty && autoComplete.IsChecked == true);

        var settings = scenario.Services.GetRequiredService<SettingsService>();
        Assert.True(await settings.GetGlobalAsync(SettingsCatalogue.AutoCompleteParents));
    }

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

        Assert.Equal("Undid: Move 'Task'", scenario.Shell.Undo!.Status);

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
    public async Task Undo_and_redo_menu_items_show_descriptions_and_work_with_the_mouse()
    {
        using var scenario = await UndoScenario.OpenWorkspaceAsync();
        HeadlessInput.Click(scenario.Window, HeadlessInput.Find<MenuItem>(scenario.Window, "EditMenu"));
        var undo = HeadlessInput.Find<MenuItem>(scenario.Window, "UndoMenuItem");
        var redo = HeadlessInput.Find<MenuItem>(scenario.Window, "RedoMenuItem");
        Assert.False(undo.IsEffectivelyEnabled);
        Assert.False(redo.IsEffectivelyEnabled);

        await scenario.Items.SetCompletedAsync(scenario.ProjectId, null, scenario.ItemId, true);
        Dispatcher.UIThread.RunJobs();

        Assert.True(undo.IsEffectivelyEnabled);
        Assert.Equal("Undo: Complete 'Task'", undo.Header);
        HeadlessInput.Click(scenario.Window, undo);
        await HeadlessInput.WaitUntilAsync(() => scenario.History.CanRedo);

        Assert.Null(await scenario.ReadCompletionAsync());
        Assert.True(redo.IsEffectivelyEnabled);
        Assert.Equal("Redo: Complete 'Task'", redo.Header);
        Assert.Equal("Undid: Complete 'Task'", HeadlessInput.Find<TextBlock>(scenario.Window, "WorkspaceUndoStatus").Text);

        HeadlessInput.ClickMenuItem(scenario.Window, "EditMenu", "RedoMenuItem");
        await HeadlessInput.WaitUntilAsync(() => !scenario.History.CanRedo);

        Assert.NotNull(await scenario.ReadCompletionAsync());
    }
}