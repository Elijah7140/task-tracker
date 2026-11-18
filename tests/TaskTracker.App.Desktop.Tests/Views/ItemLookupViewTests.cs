using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Threading;

using CommunityToolkit.Mvvm.Input;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests.Views;

/// <summary>Exercises the workspace lookup submenus and the editor status picker.</summary>
public sealed class ItemLookupViewTests
{
    [AvaloniaTheory]
    [InlineData(false, true)]
    [InlineData(true, true)]
    [InlineData(false, false)]
    [InlineData(true, false)]
    public async Task Row_submenus_select_status_and_priority_by_mouse_and_keyboard(bool keyboard, bool status)
    {
        using var services = await TestServices.CreateAsync();
        var (window, item) = await OpenWorkspaceAsync(services, false);
        var menu = await OpenSubmenuAsync(window, keyboard, status);
        var choice = status ? "Testing" : "High";
        var entry = HeadlessInput.FindNamed<MenuItem>(window, "LookupChoice", choice);
        Assert.True(menu.IsSubMenuOpen);
        Assert.True(HeadlessInput.FindNamed<MenuItem>(window, "LookupChoice", "None").IsChecked);
        Assert.False(entry.IsChecked);

        if (keyboard)
        {
            for (var attempt = 0; !entry.IsFocused && attempt < menu.Items.Count; attempt++)
            {
                HeadlessInput.Press(window, Key.Down);
            }

            Assert.True(entry.IsFocused);
            HeadlessInput.Press(window, Key.Enter);
        }
        else
        {
            HeadlessInput.Click(window, entry);
        }

        var command = Assert.IsAssignableFrom<IAsyncRelayCommand>(entry.Command);
        await Assert.IsAssignableFrom<Task>(command.ExecutionTask);
        var items = services.GetRequiredService<ItemService>();
        var stored = Assert.Single((await items.LoadAreaAsync(item.ProjectId, null)).Items).Item;
        if (status)
        {
            Assert.Equal("Testing", HeadlessInput.Find<TextBlock>(window, "ItemStatusChip").Text);
            Assert.NotNull(stored.StatusId);
        }
        else
        {
            Assert.Equal(BuiltInLookups.HighId, stored.PriorityLevelId);
        }

        window.Close();
    }

    [AvaloniaFact]
    public async Task Cancelling_Done_leaves_only_the_current_status_checked_when_the_menu_reopens()
    {
        var owner = new MainWindow { Width = 1200, Height = 920 };
        using var services = await TestServices.CreateAsync(owner);
        var (window, item) = await OpenWorkspaceAsync(services, false, withStatus: true, owner: owner, withChild: true);

        await OpenSubmenuAsync(window, keyboard: false, status: true, titleName: item.Title);
        var done = HeadlessInput.FindNamed<MenuItem>(window, "LookupChoice", "Completed");
        HeadlessInput.Click(window, done);
        await HeadlessInput.WaitUntilAsync(() => window.OwnedWindows.Any());
        HeadlessInput.Press(Assert.Single(window.OwnedWindows), Key.Escape);
        var command = Assert.IsAssignableFrom<IAsyncRelayCommand>(done.Command);
        await Assert.IsAssignableFrom<Task>(command.ExecutionTask);

        await OpenSubmenuAsync(window, keyboard: false, status: true, titleName: item.Title);
        var current = Assert.Single(HeadlessInput.FindAll<MenuItem>(window, "LookupChoice"), entry => entry.IsChecked);
        Assert.Equal("Testing", current.Header);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData("search")]
    [InlineData("calendar")]
    [InlineData("today")]
    public async Task Transient_page_row_menus_set_status_and_priority_by_mouse(string surface)
    {
        using var services = await TestServices.CreateAsync();
        var item = await TodayViewTests.SeedDatedItemAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = ScreenSnapshotTests.OpenWindow(shell, dark: false);
        await shell.OpenProjectAsync(item.ProjectId);
        Dispatcher.UIThread.RunJobs();
        await TodayViewTests.OpenSurfaceAsync(services, window, shell, item, surface);

        await ChooseFromRowMenuAsync(window, item.Title, "SetStatusMenuItem", "Testing");
        await ChooseFromRowMenuAsync(window, item.Title, "SetPriorityMenuItem", "High");

        var stored = await ReadItemAsync(services, item);
        var testing = (await services.GetRequiredService<LookupService>().StatusesAsync()).Single(row => row.Name == "Testing");
        Assert.Equal(testing.Id, stored.StatusId);
        Assert.Equal(BuiltInLookups.HighId, stored.PriorityLevelId);
        Assert.Equal("Testing", ShownStatus(window, item.Title, surface));
        await shell.GoHomeAsync();
        window.Close();
    }

    [AvaloniaFact]
    public async Task Editor_combo_selects_and_saves_an_open_status()
    {
        using var services = await TestServices.CreateAsync();
        var (window, _) = await OpenWorkspaceAsync(services, false);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "ItemTitleButton"));
        HeadlessInput.ChooseItem(window, HeadlessInput.Find<ComboBox>(window, "EditorStatusBox"), "In progress");

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "EditorSaveButton"));

        await HeadlessInput.WaitUntilAsync(() => HeadlessInput.FindAll<TextBlock>(window, "ItemStatusChip")
            .Any(chip => chip.Text == "In progress"));
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    [InlineData(true, true)]
    public async Task Status_menu_and_editor_match_approved_images(bool dark, bool editor)
    {
        using var services = await TestServices.CreateAsync();
        var (window, item) = await OpenWorkspaceAsync(services, dark, withStatus: true);

        if (editor)
        {
            HeadlessInput.Click(window, HeadlessInput.FindNamed<Button>(window, "ItemTitleButton", item.Title));
        }
        else
        {
            await OpenSubmenuAsync(window, keyboard: false, status: true);
        }

        using var frame = window.CaptureRenderedFrame();
        Assert.NotNull(frame);
        var screen = editor ? "editor-status" : "workspace-status-menu";
        SnapshotComparer.AssertMatches(frame, $"{screen}-{ScreenSnapshotTests.ThemeName(dark)}");
        window.Close();
    }

    private static async Task<MenuItem> OpenSubmenuAsync(MainWindow window, bool keyboard, bool status, string? titleName = null)
    {
        var title = titleName is null
            ? HeadlessInput.Find<Button>(window, "ItemTitleButton")
            : HeadlessInput.FindNamed<Button>(window, "ItemTitleButton", titleName);
        if (keyboard)
        {
            Assert.True(title.Focus());
            window.KeyPress(Key.F10, RawInputModifiers.Shift, PhysicalKey.None, null);
            window.KeyRelease(Key.F10, RawInputModifiers.Shift, PhysicalKey.None, null);
            Dispatcher.UIThread.RunJobs();
        }
        else
        {
            var point = HeadlessInput.CentreOf(window, title);
            HeadlessInput.PressMouse(window, point, MouseButton.Right);
            HeadlessInput.ReleaseMouse(window, point, MouseButton.Right);
        }

        var menuId = status ? "SetStatusMenuItem" : "SetPriorityMenuItem";
        await HeadlessInput.WaitUntilAsync(() => HeadlessInput.FindAll<MenuItem>(window, menuId).Count == 1);
        var menu = HeadlessInput.Find<MenuItem>(window, menuId);
        if (keyboard)
        {
            for (var attempt = 0; !menu.IsFocused && attempt < 12; attempt++)
            {
                HeadlessInput.Press(window, Key.Down);
            }

            Assert.True(menu.IsFocused);
            HeadlessInput.Press(window, Key.Right);
        }
        else
        {
            HeadlessInput.Click(window, menu);
        }

        await HeadlessInput.WaitUntilAsync(() => menu.IsSubMenuOpen &&
            HeadlessInput.FindAll<MenuItem>(window, "LookupChoice").Count > 0);
        return menu;
    }

    /// <summary>Right-clicks the row, opens the submenu with the mouse and clicks the choice.</summary>
    private static async Task ChooseFromRowMenuAsync(MainWindow window, string title, string menuId, string choice)
    {
        var row = FindRow(window, title);
        var point = HeadlessInput.PointIn(window, row, Math.Min(40, row.Bounds.Width / 2), row.Bounds.Height / 2);
        HeadlessInput.PressMouse(window, point, MouseButton.Right);
        HeadlessInput.ReleaseMouse(window, point, MouseButton.Right);
        await HeadlessInput.WaitUntilAsync(() => HeadlessInput.FindAll<MenuItem>(window, menuId).Count == 1);
        var menu = HeadlessInput.Find<MenuItem>(window, menuId);
        HeadlessInput.Click(window, menu);
        await HeadlessInput.WaitUntilAsync(() => menu.IsSubMenuOpen);

        var entry = HeadlessInput.FindNamed<MenuItem>(window, "LookupChoice", choice);
        HeadlessInput.Click(window, entry);

        var command = Assert.IsAssignableFrom<IAsyncRelayCommand>(entry.Command);
        await Assert.IsAssignableFrom<Task>(command.ExecutionTask);
        Dispatcher.UIThread.RunJobs();
    }

    /// <summary>The row control that owns the context menu on the Search, Calendar or Today page.</summary>
    private static Control FindRow(MainWindow window, string title)
    {
        var searchRows = HeadlessInput.FindAll<ListBoxItem>(window, "SearchResultRow");
        var calendarRows = HeadlessInput.FindAll<Button>(window, "CalendarEntryButton");
        var todayRows = HeadlessInput.FindAll<Grid>(window, "TodayItemRow");
        var rows = searchRows.Cast<Control>().Concat(calendarRows).Concat(todayRows);
        return rows.Single(row => AutomationProperties.GetName(row) == title);
    }

    /// <summary>Search and Today rows show a status chip; one-line calendar entries name it in the tooltip.</summary>
    private static string? ShownStatus(MainWindow window, string title, string surface)
    {
        var row = FindRow(window, title);
        if (surface == "calendar")
        {
            var tooltip = Assert.IsType<string>(ToolTip.GetTip(row));
            return tooltip.Split(" · ").Last();
        }

        return HeadlessInput.FindAll<TextBlock>(row, "ItemStatusChip").Single().Text;
    }

    private static async Task<TodoItem> ReadItemAsync(IServiceProvider services, TodoItem item)
    {
        var area = await services.GetRequiredService<ItemService>().LoadAreaAsync(item.ProjectId, item.FolderId);
        return area.Items.Single(node => node.Item.Id == item.Id).Item;
    }

    private static async Task<(MainWindow Window, TodoItem Item)> OpenWorkspaceAsync(
        TestServiceScope services, bool dark, bool withStatus = false, MainWindow? owner = null, bool withChild = false)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Release");
        var items = services.GetRequiredService<ItemService>();
        var item = await items.CreateAsync(project.Id, null, null, "Review release notes");
        if (withStatus)
        {
            var status = (await services.GetRequiredService<LookupService>().StatusesAsync()).Single(row => row.Name == "Testing");
            await items.SetStatusAsync(item.Id, status.Id);
        }

        if (withChild)
        {
            await items.CreateAsync(project.Id, null, item.Id, "Open child");
        }

        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = owner ?? ScreenSnapshotTests.OpenWindow(shell, dark, height: 920);
        if (owner is not null)
        {
            owner.DataContext = shell;
            owner.Show();
        }

        await shell.OpenProjectAsync(project.Id);
        Dispatcher.UIThread.RunJobs();
        return (window, item);
    }
}