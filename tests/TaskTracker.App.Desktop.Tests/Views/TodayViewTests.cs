#pragma warning disable xUnit1051
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Threading;

using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;

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
        shell.ShowsTitleBar = true;
        var window = ScreenSnapshotTests.OpenWindow(shell, dark: false);
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();
        var home = shell.CurrentPage;
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "TopSearchButton"));

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
        shell.ShowsTitleBar = true;
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
        shell.ShowsTitleBar = true;
        var window = ScreenSnapshotTests.OpenWindow(shell, dark: false);
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "TopTodayButton"));

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
    public async Task Window_activation_refreshes_today_before_the_next_timer_tick()
    {
        using var services = await TestServices.CreateAsync();
        var clock = Assert.IsType<FakeTimeProvider>(services.GetRequiredService<TimeProvider>());
        clock.AdjustTime(new DateTimeOffset(2026, 11, 13, 10, 0, 0, TimeSpan.Zero));
        var item = await SeedDatedItemAsync(services);
        await services.GetRequiredService<ItemService>().SetCompletedAsync(item.ProjectId, null, item.Id, true);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = ScreenSnapshotTests.OpenWindow(shell, dark: false);
        await shell.GoHomeAsync();
        await shell.OpenTodayAsync();
        var today = Assert.IsType<TodayViewModel>(shell.CurrentPage);
        Assert.Equal(1, today.CompletedCount);

        clock.AdjustTime(new DateTimeOffset(2026, 11, 14, 1, 0, 0, TimeSpan.Zero));
        window.Activate();
        Dispatcher.UIThread.RunJobs();

        Assert.True(today.IsEmpty);
        await shell.GoHomeAsync();
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

    [AvaloniaTheory]
    [InlineData("workspace", Key.Apps, RawInputModifiers.None)]
    [InlineData("workspace", Key.F10, RawInputModifiers.Shift)]
    [InlineData("search", Key.Apps, RawInputModifiers.None)]
    [InlineData("search", Key.F10, RawInputModifiers.Shift)]
    [InlineData("calendar", Key.Apps, RawInputModifiers.None)]
    [InlineData("calendar", Key.F10, RawInputModifiers.Shift)]
    [InlineData("today", Key.Apps, RawInputModifiers.None)]
    [InlineData("today", Key.F10, RawInputModifiers.Shift)]
    public async Task A_focused_row_opens_its_push_back_menu_from_the_keyboard(string surface, Key key,
        RawInputModifiers modifiers)
    {
        using var services = await TestServices.CreateAsync();
        var item = await SeedDatedItemAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = ScreenSnapshotTests.OpenWindow(shell, dark: false);
        await shell.OpenProjectAsync(item.ProjectId);
        Dispatcher.UIThread.RunJobs();
        var row = surface == "workspace"
            ? HeadlessInput.FindNamed<Button>(window, "ItemTitleButton", item.Title)
            : await OpenSurfaceAsync(services, window, shell, item, surface);
        Assert.True(row.Focus());

        window.KeyPress(key, modifiers, PhysicalKey.None, null);
        window.KeyRelease(key, modifiers, PhysicalKey.None, null);
        Dispatcher.UIThread.RunJobs();

        var menu = HeadlessInput.Find<MenuItem>(window, "PushBackOneDayMenuItem");
        Assert.Equal("Push back one day", menu.Header);
        Assert.True(menu.IsEffectivelyEnabled);
        Assert.NotEmpty(HeadlessInput.Find<MenuItem>(window, "SetStatusMenuItem").Items);
        Assert.NotEmpty(HeadlessInput.Find<MenuItem>(window, "SetPriorityMenuItem").Items);
        await shell.GoHomeAsync();
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData("calendar")]
    [InlineData("today")]
    public async Task Push_back_shortcut_moves_only_the_focused_row(string surface)
    {
        using var services = await TestServices.CreateAsync();
        var first = await SeedDatedItemAsync(services);
        var items = services.GetRequiredService<ItemService>();
        var second = await items.CreateAsync(first.ProjectId, null, null, "Other task");
        await items.EditAsync(second.Id, new ItemEdit(second.Title, null, null, null, null, Due, null, null, null));
        if (surface == "today")
        {
            await AddCompletedChildAndOpenChildAsync(items, first);
        }

        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = ScreenSnapshotTests.OpenWindow(shell, dark: false);
        await shell.OpenProjectAsync(first.ProjectId);
        var focused = await OpenSurfaceAsync(services, window, shell, second, surface);
        Assert.True(focused.Focus());

        HeadlessInput.Press(window, Key.P, ControlShift);

        Assert.Equal(Due, await ReadDueAsync(services, first));
        Assert.Equal(Due.AddDays(1), await ReadDueAsync(services, second));
        await shell.GoHomeAsync();
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
        shell.ShowsTitleBar = true;
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

    internal static async Task<TodoItem> SeedDatedItemAsync(IServiceProvider services)
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

    internal static async Task<Control> OpenSurfaceAsync(IServiceProvider services, MainWindow window,
        MainWindowViewModel shell, TodoItem item, string surface)
    {
        switch (surface)
        {
            case "workspace":
                return HeadlessInput.Find<Border>(window, "ItemCard");
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
                await AddCompletedChildAndOpenChildAsync(items, item);
                await shell.OpenTodayAsync();
                Dispatcher.UIThread.RunJobs();
                return HeadlessInput.FindNamed<Grid>(window, "TodayItemRow", item.Title);
        }
    }

    private static async Task AddCompletedChildAndOpenChildAsync(ItemService items, TodoItem parent)
    {
        var child = await items.CreateAsync(parent.ProjectId, null, parent.Id, "Done");
        await items.CreateAsync(parent.ProjectId, null, parent.Id, "Still open");
        await items.SetCompletedAsync(parent.ProjectId, null, child.Id, true);
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