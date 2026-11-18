using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Threading;
using Avalonia.VisualTree;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Trash;
using TaskTracker.Presentation.ViewModels;


namespace TaskTracker.App.Desktop.Tests.Views;

/// <summary>Trash shortcut, buttons, restore, permanent deletion and navigation through simulated input.</summary>
public sealed class TrashViewTests
{
    private const RawInputModifiers CtrlShift = RawInputModifiers.Control | RawInputModifiers.Shift;

    [AvaloniaFact]
    public async Task Shortcut_opens_trash_from_home_and_Escape_returns_home()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();
        var home = shell.CurrentPage;

        HeadlessInput.Press(window, Key.T, CtrlShift);

        var page = Assert.IsType<TrashViewModel>(shell.CurrentPage);
        Assert.Equal(TrashViewModel.AllProjectsScope, page.SelectedScope);
        HeadlessInput.Press(window, Key.Escape);
        Assert.Same(home, shell.CurrentPage);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(RawInputModifiers.Control)]
    [InlineData(RawInputModifiers.Shift)]
    [InlineData(RawInputModifiers.Control | RawInputModifiers.Alt)]
    [InlineData(RawInputModifiers.Control | RawInputModifiers.Shift | RawInputModifiers.Alt)]
    [InlineData(RawInputModifiers.None)]
    public async Task Trash_shortcut_ignores_extra_or_missing_modifiers(RawInputModifiers modifiers)
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();

        HeadlessInput.Press(window, Key.T, modifiers);

        Assert.IsType<HomeViewModel>(shell.CurrentPage);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(RawInputModifiers.Shift)]
    [InlineData(RawInputModifiers.Control)]
    [InlineData(RawInputModifiers.Alt)]
    public async Task Escape_with_a_modifier_does_not_leave_the_trash(RawInputModifiers modifiers)
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();
        HeadlessInput.Press(window, Key.T, CtrlShift);

        HeadlessInput.Press(window, Key.Escape, modifiers);

        Assert.IsType<TrashViewModel>(shell.CurrentPage);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Shortcut_in_a_workspace_scopes_to_the_project_and_Escape_returns_to_the_same_workspace()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var projectId = await TrashTestData.SeedAsync(services);
        var shell = ShowShell(window, services);
        await shell.OpenProjectAsync(projectId);
        Dispatcher.UIThread.RunJobs();
        var workspace = shell.CurrentPage;

        HeadlessInput.Press(window, Key.T, CtrlShift);
        var page = Assert.IsType<TrashViewModel>(shell.CurrentPage);
        await WaitForRowsAsync(page);
        HeadlessInput.Press(window, Key.T, CtrlShift);
        HeadlessInput.Press(window, Key.Escape);

        Assert.Equal(TrashViewModel.ThisProjectScope, page.SelectedScope);
        Assert.DoesNotContain(page.Batches, row => row.Title == TrashTestData.DeletedProjectName);
        Assert.Same(workspace, shell.CurrentPage);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Clicking_the_trash_buttons_on_home_and_in_a_workspace_opens_the_trash_and_Back_returns()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();

        HeadlessInput.ClickMenuItem(window, "ViewMenu", "TrashMenuItem");
        Assert.IsType<TrashViewModel>(shell.CurrentPage);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "TrashBackButton"));
        Assert.IsType<HomeViewModel>(shell.CurrentPage);

        await shell.OpenProjectAsync(project.Id);
        Dispatcher.UIThread.RunJobs();
        HeadlessInput.ClickMenuItem(window, "ViewMenu", "TrashMenuItem");
        Assert.IsType<TrashViewModel>(shell.CurrentPage);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "TrashBackButton"));
        Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Clicking_Restore_brings_the_item_back_to_the_workspace()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var projectId = await TrashTestData.SeedAsync(services);
        var shell = ShowShell(window, services);
        await shell.OpenProjectAsync(projectId);
        Dispatcher.UIThread.RunJobs();
        var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        HeadlessInput.ClickMenuItem(window, "ViewMenu", "TrashMenuItem");
        var page = Assert.IsType<TrashViewModel>(shell.CurrentPage);
        await WaitForRowsAsync(page);

        HeadlessInput.Click(window, RowButton(window, TrashTestData.DeletedItemName, "RestoreBatchButton"));
        await HeadlessInput.WaitUntilAsync(() => page.Batches.All(row => row.Title != TrashTestData.DeletedItemName));
        HeadlessInput.Press(window, Key.Escape);
        await HeadlessInput.WaitUntilAsync(() => ReferenceEquals(shell.CurrentPage, workspace));

        Assert.Contains(workspace.OpenItems, row => row.Title == TrashTestData.DeletedItemName);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Restore_is_disabled_with_a_reason_for_a_folder_whose_parent_is_deleted()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        await TrashTestData.SeedAsync(services);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();
        HeadlessInput.Press(window, Key.T, CtrlShift);
        await WaitForRowsAsync(Assert.IsType<TrashViewModel>(shell.CurrentPage));

        var blocked = RowButton(window, TrashTestData.BlockedFolderName, "RestoreBatchButton");
        var allowed = RowButton(window, TrashTestData.DeletedFolderName, "RestoreBatchButton");
        var reason = HeadlessInput.Find<TextBlock>(window, "TrashRestoreBlockedReason");

        Assert.False(blocked.IsEnabled);
        Assert.True(allowed.IsEnabled);
        Assert.Equal("Restore the folder 'Legacy' first", reason.Text);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(DialogAnswer.ClickConfirm)]
    [InlineData(DialogAnswer.PressEnter)]
    [InlineData(DialogAnswer.PressEscape)]
    public async Task Delete_permanently_asks_first_and_only_a_click_on_confirm_deletes(DialogAnswer answer)
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        await TrashTestData.SeedAsync(services);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();
        HeadlessInput.Press(window, Key.T, CtrlShift);
        var page = Assert.IsType<TrashViewModel>(shell.CurrentPage);
        await WaitForRowsAsync(page);

        HeadlessInput.Click(window, RowButton(window, TrashTestData.DeletedItemName, "PurgeBatchButton"));
        var dialog = OpenDialog(window);
        Assert.Equal("Delete permanently", dialog.Title);
        Answer(dialog, answer);
        await SettleAsync(window, page);

        var remaining = await ListedTitlesAsync(services);
        Assert.Equal(answer != DialogAnswer.ClickConfirm, remaining.Contains(TrashTestData.DeletedItemName));
        Assert.Equal(answer == DialogAnswer.ClickConfirm ? 3 : 4, remaining.Count);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(DialogAnswer.ClickConfirm)]
    [InlineData(DialogAnswer.PressEnter)]
    [InlineData(DialogAnswer.PressEscape)]
    public async Task Empty_trash_asks_first_and_only_a_click_on_confirm_empties_it(DialogAnswer answer)
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        await TrashTestData.SeedAsync(services);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();
        HeadlessInput.Press(window, Key.T, CtrlShift);
        var page = Assert.IsType<TrashViewModel>(shell.CurrentPage);
        await WaitForRowsAsync(page);

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "EmptyTrashButton"));
        var dialog = OpenDialog(window);
        Assert.Equal("Empty trash", dialog.Title);
        Answer(dialog, answer);
        await SettleAsync(window, page);

        var confirmed = answer == DialogAnswer.ClickConfirm;
        Assert.Equal(confirmed ? 0 : 4, (await ListedTitlesAsync(services)).Count);
        Assert.Equal(confirmed, page.ShowEmpty);
        Assert.Equal(!confirmed, HeadlessInput.Find<Button>(window, "EmptyTrashButton").IsEffectivelyEnabled);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Trash_shortcut_does_nothing_while_a_confirmation_dialog_is_open()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "DeleteProjectButton"));
        var dialog = OpenDialog(window);

        HeadlessInput.Press(dialog, Key.T, CtrlShift);
        HeadlessInput.Press(window, Key.T, CtrlShift);

        Assert.IsType<HomeViewModel>(shell.CurrentPage);
        Assert.Single(window.OwnedWindows);
        HeadlessInput.Press(dialog, Key.Escape);
        window.Close();
    }

    /// <summary>How a test answers a destructive confirmation.</summary>
    public enum DialogAnswer
    {
        ClickConfirm,
        PressEnter,
        PressEscape
    }

    private static void Answer(Window dialog, DialogAnswer answer)
    {
        switch (answer)
        {
            case DialogAnswer.ClickConfirm:
                HeadlessInput.Click(dialog, HeadlessInput.Find<Button>(dialog, "DialogConfirmButton"));
                break;
            case DialogAnswer.PressEnter:
                HeadlessInput.Press(dialog, Key.Enter);
                break;
            default:
                HeadlessInput.Press(dialog, Key.Escape);
                break;
        }
    }

    /// <summary>Waits until the dialog is closed and the page has finished its change and reload.</summary>
    private static async Task SettleAsync(Window window, TrashViewModel page)
    {
        await HeadlessInput.WaitUntilAsync(() => window.OwnedWindows.Count == 0 && !page.IsWorking);
    }

    private static async Task<IReadOnlyList<string>> ListedTitlesAsync(IServiceProvider services)
    {
        var batches = await services.GetRequiredService<TrashService>().ListAsync(TrashScope.AllProjects);
        return batches.Select(batch => batch.Title).ToArray();
    }


    [AvaloniaFact]
    public async Task Empty_state_shows_a_message_and_disables_Empty_trash()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();

        HeadlessInput.Press(window, Key.T, CtrlShift);
        await HeadlessInput.WaitUntilAsync(() => Assert.IsType<TrashViewModel>(shell.CurrentPage).ShowEmpty);

        Assert.True(HeadlessInput.Find<TextBlock>(window, "TrashEmptyText").IsEffectivelyVisible);
        Assert.False(HeadlessInput.Find<Button>(window, "EmptyTrashButton").IsEffectivelyEnabled);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Choosing_all_projects_in_the_scope_box_lists_other_projects_too()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var projectId = await TrashTestData.SeedAsync(services);
        var shell = ShowShell(window, services);
        await shell.OpenProjectAsync(projectId);
        Dispatcher.UIThread.RunJobs();
        HeadlessInput.Press(window, Key.T, CtrlShift);
        var page = Assert.IsType<TrashViewModel>(shell.CurrentPage);
        await WaitForRowsAsync(page);

        HeadlessInput.ChooseItem(window, HeadlessInput.Find<ComboBox>(window, "TrashScopeComboBox"),
            TrashViewModel.AllProjectsScope);

        await HeadlessInput.WaitUntilAsync(() => page.Batches.Any(row => row.Title == TrashTestData.DeletedProjectName));
        window.Close();
    }

    private static MainWindowViewModel ShowShell(MainWindow window, IServiceProvider services)
    {
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;
        window.Show();
        return shell;
    }

    private static async Task WaitForRowsAsync(TrashViewModel page)
    {
        await HeadlessInput.WaitUntilAsync(() => page.Batches.Count > 0);
    }

    private static Button RowButton(Window window, string rowTitle, string buttonId)
    {
        var row = HeadlessInput.FindNamed<Border>(window, "TrashBatchRow", rowTitle);
        return row.GetVisualDescendants().OfType<Button>()
            .Single(button => AutomationProperties.GetAutomationId(button) == buttonId);
    }

    private static Window OpenDialog(Window owner)
    {
        Dispatcher.UIThread.RunJobs();
        return Assert.Single(owner.OwnedWindows);
    }
}