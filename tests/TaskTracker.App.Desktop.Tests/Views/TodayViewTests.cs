#pragma warning disable xUnit1051
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Threading;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Reminders;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests.Views;

/// <summary>Exercises Today and Push back through real controls and simulated input.</summary>
public sealed class TodayViewTests
{
    private const RawInputModifiers ControlShift = RawInputModifiers.Control | RawInputModifiers.Shift;
    private static readonly DateOnly Due = new(2026, 11, 13);

    [AvaloniaFact]
    public async Task Today_shortcut_replaces_search_and_escape_returns_to_home()
    {
        using var services = await TestServices.CreateAsync();
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = ScreenSnapshotTests.OpenWindow(shell, dark: false);
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();
        var home = shell.CurrentPage;
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "HomeSearchButton"));

        HeadlessInput.Press(window, Key.D, ControlShift);

        Assert.IsType<TodayViewModel>(shell.CurrentPage);
        Assert.NotNull(HeadlessInput.Find<TextBlock>(window, "TodayEmptyState"));
        HeadlessInput.Press(window, Key.Escape);
        Assert.Same(home, shell.CurrentPage);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Top_navigation_opens_today_and_title_opens_its_item()
    {
        using var services = await TestServices.CreateAsync();
        var item = await SeedDatedItemAsync(services);
        await services.GetRequiredService<ItemService>().SetCompletedAsync(item.ProjectId, null, item.Id, true);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        shell.EnableReminders(services.GetRequiredService<ReminderService>());
        var window = ScreenSnapshotTests.OpenWindow(shell, dark: false);
        await shell.GoHomeAsync();
        await shell.OpenSearchAsync();
        Dispatcher.UIThread.RunJobs();

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "TopTodayButton"));
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "TodayOpenItemButton"));

        Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Unchecking_reopens_and_undo_puts_the_completion_back()
    {
        using var services = await TestServices.CreateAsync();
        var items = services.GetRequiredService<ItemService>();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project");
        var item = await items.CreateAsync(project.Id, null, null, "Filed report");
        await items.SetCompletedAsync(project.Id, null, item.Id, true);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = ScreenSnapshotTests.OpenWindow(shell, dark: false);
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "HomeTodayButton"));

        HeadlessInput.Click(window, HeadlessInput.Find<CheckBox>(window, "TodayReopenCheckBox"));

        await HeadlessInput.WaitUntilAsync(() => ((TodayViewModel)shell.CurrentPage!).IsEmpty);
        HeadlessInput.Press(window, Key.Z, RawInputModifiers.Control);
        await HeadlessInput.WaitUntilAsync(() => ((TodayViewModel)shell.CurrentPage!).CompletedCount == 1);
        Assert.True(HeadlessInput.Find<CheckBox>(window, "TodayReopenCheckBox").IsChecked);
        await shell.ReturnFromTodayAsync();
        window.Close();
    }

    [AvaloniaFact]
    public async Task Push_back_shortcut_acts_on_the_selected_item_and_leaves_text_input_alone()
    {
        using var services = await TestServices.CreateAsync();
        var item = await SeedDatedItemAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = ScreenSnapshotTests.OpenWindow(shell, dark: false);
        await shell.OpenProjectAsync(item.ProjectId);
        Dispatcher.UIThread.RunJobs();
        var title = HeadlessInput.FindNamed<Button>(window, "ItemTitleButton", item.Title);
        HeadlessInput.Click(window, title);
        HeadlessInput.Click(window, HeadlessInput.Find<TextBox>(window, "QuickAddBox"));

        HeadlessInput.Press(window, Key.P, ControlShift);

        Assert.Equal(Due, await ReadDueAsync(services, item));
        HeadlessInput.Click(window, title);
        HeadlessInput.Press(window, Key.P, ControlShift);
        Assert.Equal(Due.AddDays(1), await ReadDueAsync(services, item));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Push_back_shortcut_in_search_moves_a_schedule_only_result()
    {
        using var services = await TestServices.CreateAsync();
        var item = await SeedDatedItemAsync(services);
        var items = services.GetRequiredService<ItemService>();
        var start = Due.ToDateTime(new TimeOnly(9, 30));
        await items.EditAsync(item.Id, new ItemEdit(item.Title, null, null, null, null, null, null, start, null));
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = ScreenSnapshotTests.OpenWindow(shell, dark: false);
        await shell.GoHomeAsync();
        var row = await OpenSurfaceAsync(services, window, shell, item, "search");
        HeadlessInput.Click(window, row);

        HeadlessInput.Press(window, Key.P, ControlShift);

        var area = await items.LoadAreaAsync(item.ProjectId, item.FolderId);
        Assert.Equal(start.AddDays(1), Assert.Single(area.Items).Item.ScheduledStart);
        Assert.Null(Assert.Single(area.Items).Item.ScheduledEnd);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData("workspace")]
    [InlineData("search")]
    [InlineData("calendar")]
    [InlineData("today")]
    public async Task Row_context_menu_pushes_back_the_item(string surface)
    {
        using var services = await TestServices.CreateAsync();
        var item = await SeedDatedItemAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = ScreenSnapshotTests.OpenWindow(shell, dark: false);
        await shell.OpenProjectAsync(item.ProjectId);
        Dispatcher.UIThread.RunJobs();
        var row = await OpenSurfaceAsync(services, window, shell, item, surface);

        var menu = await OpenPushBackMenuAsync(window, row);
        Assert.True(menu.IsEffectivelyEnabled);
        HeadlessInput.Click(window, menu);

        Assert.Equal(Due.AddDays(1), await ReadDueAsync(services, item));
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();
        window.Close();
    }

    [AvaloniaFact]
    public async Task Today_menu_explains_why_completed_items_cannot_move_and_can_open_the_item()
    {
        using var services = await TestServices.CreateAsync();
        var item = await SeedDatedItemAsync(services);
        await services.GetRequiredService<ItemService>().SetCompletedAsync(item.ProjectId, null, item.Id, true);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = ScreenSnapshotTests.OpenWindow(shell, dark: false);
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();
        await shell.OpenTodayAsync();
        Dispatcher.UIThread.RunJobs();

        var row = HeadlessInput.FindNamed<Grid>(window, "TodayItemRow", item.Title);
        var menu = await OpenPushBackMenuAsync(window, row);

        Assert.False(menu.IsEffectivelyEnabled);
        Assert.True(ToolTip.GetShowOnDisabled(menu));
        Assert.Equal("Completed items cannot be pushed back.", ToolTip.GetTip(menu));
        HeadlessInput.Click(window, HeadlessInput.Find<MenuItem>(window, "TodayOpenMenuItem"));
        Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    [InlineData(true, true)]
    public async Task Today_and_its_row_menu_match_the_approved_images(bool dark, bool showMenu)
    {
        using var services = await TestServices.CreateAsync();
        await SeedNestedTodayAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        shell.EnableReminders(services.GetRequiredService<ReminderService>());
        var window = ScreenSnapshotTests.OpenWindow(shell, dark);
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();
        await shell.OpenTodayAsync();
        Dispatcher.UIThread.RunJobs();

        if (showMenu)
        {
            var row = HeadlessInput.FindNamed<Grid>(window, "TodayItemRow", "Prepare release");
            await OpenPushBackMenuAsync(window, row);
        }

        using var frame = window.CaptureRenderedFrame();
        Assert.NotNull(frame);
        var screen = showMenu ? "today-row-menu" : "today";
        SnapshotComparer.AssertMatches(frame, $"{screen}-{ScreenSnapshotTests.ThemeName(dark)}");
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();
        window.Close();
    }

    private static async Task<TodoItem> SeedDatedItemAsync(IServiceProvider services)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var items = services.GetRequiredService<ItemService>();
        var item = await items.CreateAsync(project.Id, null, null, "Dated task");
        await items.EditAsync(item.Id, new ItemEdit(item.Title, null, null, null, null, Due, null, null, null));
        return item;
    }

    private static async Task SeedNestedTodayAsync(IServiceProvider services)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing DB");
        var folder = await services.GetRequiredService<FolderService>().CreateAsync(project.Id, null, "dbo");
        var items = services.GetRequiredService<ItemService>();
        var root = await items.CreateAsync(project.Id, folder.Id, null, "Prepare release");
        await items.EditAsync(root.Id, new ItemEdit(root.Title, null, null, null, null, Due, null, null, null));
        var parent = await items.CreateAsync(project.Id, folder.Id, root.Id, "Review schema changes");
        var index = await items.CreateAsync(project.Id, folder.Id, parent.Id, "Check indexes");
        var migration = await items.CreateAsync(project.Id, folder.Id, parent.Id, "Run migrations");
        var notes = await items.CreateAsync(project.Id, folder.Id, root.Id, "Write release notes");
        await items.CreateAsync(project.Id, folder.Id, root.Id, "Deploy to production");
        await items.SetCompletedAsync(project.Id, folder.Id, index.Id, true);
        await items.SetCompletedAsync(project.Id, folder.Id, migration.Id, true);
        await items.SetCompletedAsync(project.Id, folder.Id, notes.Id, true);
    }

    private static async Task<Control> OpenSurfaceAsync(IServiceProvider services, MainWindow window,
        MainWindowViewModel shell, TodoItem item, string surface)
    {
        switch (surface)
        {
            case "workspace":
                return HeadlessInput.Find<Border>(window, "ItemDragRow");
            case "search":
                await shell.OpenSearchAsync();
                Dispatcher.UIThread.RunJobs();
                HeadlessInput.TypeInto(window, HeadlessInput.Find<TextBox>(window, "SearchTextBox"), item.Title);
                HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "SearchButton"));
                return HeadlessInput.FindNamed<ListBoxItem>(window, "SearchResultRow", item.Title);
            case "calendar":
                await shell.OpenCalendarAsync();
                Dispatcher.UIThread.RunJobs();
                return HeadlessInput.FindNamed<Button>(window, "CalendarEntryButton", item.Title);
            default:
                var items = services.GetRequiredService<ItemService>();
                var child = await items.CreateAsync(item.ProjectId, null, item.Id, "Done");
                await items.CreateAsync(item.ProjectId, null, item.Id, "Still open");
                await items.SetCompletedAsync(item.ProjectId, null, child.Id, true);
                await shell.OpenTodayAsync();
                Dispatcher.UIThread.RunJobs();
                return HeadlessInput.FindNamed<Grid>(window, "TodayItemRow", item.Title);
        }
    }

    private static async Task<MenuItem> OpenPushBackMenuAsync(MainWindow window, Control row)
    {
        Dispatcher.UIThread.RunJobs();
        var point = HeadlessInput.PointIn(window, row, Math.Min(40, row.Bounds.Width / 2), row.Bounds.Height / 2);
        HeadlessInput.PressMouse(window, point, MouseButton.Right);
        HeadlessInput.ReleaseMouse(window, point, MouseButton.Right);
        await HeadlessInput.WaitUntilAsync(() => HeadlessInput.FindAll<MenuItem>(window, "PushBackOneDayMenuItem").Count == 1);
        return HeadlessInput.Find<MenuItem>(window, "PushBackOneDayMenuItem");
    }

    private static async Task<DateOnly?> ReadDueAsync(IServiceProvider services, TodoItem item)
    {
        var items = services.GetRequiredService<ItemService>();
        var rows = await items.LoadAreaAsync(item.ProjectId, item.FolderId);
        return rows.Items.Single(node => node.Item.Id == item.Id).Item.DueDate;
    }
}