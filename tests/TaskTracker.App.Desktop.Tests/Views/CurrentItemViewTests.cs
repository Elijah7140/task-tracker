#pragma warning disable xUnit1051
using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Styling;
using Avalonia.Threading;

using CommunityToolkit.Mvvm.Input;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.CurrentItem;
using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests.Views;

/// <summary>Exercises choosing the current item and the tray card through real controls (§7.17).</summary>
public sealed class CurrentItemViewTests
{
    [AvaloniaFact]
    public async Task Item_card_menu_sets_and_then_clears_the_current_item()
    {
        using var services = await TestServices.CreateAsync();
        var (window, item) = await OpenWorkspaceAsync(services);

        await ClickRowMenuAsync(window, HeadlessInput.Find<Border>(window, "ItemCard"), "ToggleCurrentItemMenuItem");

        Assert.Equal(item.Id, await StoredCurrentAsync(services));
        Assert.Single(HeadlessInput.FindAll<TextBlock>(window, "ItemCardCurrentMarker"));
        var menu = await ClickRowMenuAsync(window, HeadlessInput.Find<Border>(window, "ItemCard"),
            "ToggleCurrentItemMenuItem", click: false);
        Assert.Equal("Clear current item", menu.Header);
        HeadlessInput.Click(window, menu);
        await WaitForCommandAsync(menu.Command);
        Assert.Null(await StoredCurrentAsync(services));
        Assert.Empty(HeadlessInput.FindAll<TextBlock>(window, "ItemCardCurrentMarker"));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Star_on_an_item_card_sets_the_current_item()
    {
        using var services = await TestServices.CreateAsync();
        var (window, item) = await OpenWorkspaceAsync(services);
        var star = HeadlessInput.Find<Button>(window, "ItemCardCurrentButton");

        HeadlessInput.Click(window, star);

        await WaitForCommandAsync(star.Command);
        Assert.Equal(item.Id, await StoredCurrentAsync(services));
        Assert.Single(HeadlessInput.FindAll<TextBlock>(window, "ItemCardCurrentMarker"));
        Assert.Equal("Clear current item", Avalonia.Automation.AutomationProperties.GetName(star));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Details_panel_button_sets_the_selected_item_as_current()
    {
        using var services = await TestServices.CreateAsync();
        var (window, item) = await OpenWorkspaceAsync(services);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "ItemTitleButton"));
        await HeadlessInput.WaitUntilAsync(() => HeadlessInput.Find<Button>(window, "EditorCurrentItemButton").IsEffectivelyVisible);
        var button = HeadlessInput.Find<Button>(window, "EditorCurrentItemButton");

        HeadlessInput.Click(window, button);

        await WaitForCommandAsync(button.Command);
        Assert.Equal(item.Id, await StoredCurrentAsync(services));
        Assert.True(HeadlessInput.Find<TextBlock>(window, "ItemCardCurrentMarker").IsEffectivelyVisible);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData("search")]
    [InlineData("calendar")]
    [InlineData("today")]
    [InlineData("tickets")]
    public async Task Transient_page_row_menus_set_the_current_item(string surface)
    {
        using var services = await TestServices.CreateAsync();
        var item = await TodayViewTests.SeedDatedItemAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = ScreenSnapshotTests.OpenWindow(shell, dark: false);
        await shell.OpenProjectAsync(item.ProjectId);
        Dispatcher.UIThread.RunJobs();
        var row = await OpenSurfaceAsync(services, window, shell, item, surface);

        await ClickRowMenuAsync(window, row, "SetCurrentItemMenuItem");

        Assert.Equal(item.Id, await StoredCurrentAsync(services));
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();
        window.Close();
    }

    [AvaloniaFact]
    public async Task Card_Open_button_opens_the_current_item()
    {
        Guid? opened = null;
        var card = CreateCard(Sample(), id => opened = id);
        await card.LoadAsync();
        var window = new CurrentItemCardWindow { DataContext = card };
        window.Show();

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "CurrentItemOpenButton"));

        Assert.Equal(Sample().Id, opened);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    [InlineData(true, true)]
    public async Task Card_matches_approved_images(bool dark, bool empty)
    {
        Application.Current!.RequestedThemeVariant = dark ? ThemeVariant.Dark : ThemeVariant.Light;
        var card = CreateCard(empty ? null : Sample(), _ => { });
        await card.LoadAsync();
        var window = new CurrentItemCardWindow { DataContext = card };
        window.Show();
        Dispatcher.UIThread.RunJobs();

        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        var screen = empty ? "current-item-card-empty" : "current-item-card";
        SnapshotComparer.AssertMatches(frame, $"{screen}-{ScreenSnapshotTests.ThemeName(dark)}");
        window.Close();
    }

    private static CurrentItemCardViewModel CreateCard(CurrentItemCard? card, Action<Guid> open)
    {
        return new CurrentItemCardViewModel(() => Task.FromResult(card), id =>
        {
            open(id);
            return Task.CompletedTask;
        });
    }

    private static CurrentItemCard Sample()
    {
        return new CurrentItemCard(Guid.Parse("0193a1b2-0000-7000-8000-000000000001"), "Review release notes",
            "Billing › dbo › Views", "In progress", "High", new DateOnly(2026, 11, 20), new TimeOnly(14, 30),
            false, "Check the migration steps and the rollback plan before Friday.");
    }

    private static async Task<Control> OpenSurfaceAsync(IServiceProvider services, MainWindow window,
        MainWindowViewModel shell, TodoItem item, string surface)
    {
        if (surface != "tickets")
        {
            return await TodayViewTests.OpenSurfaceAsync(services, window, shell, item, surface);
        }

        var items = services.GetRequiredService<ItemService>();
        await items.EditAsync(item.Id, new ItemEdit(item.Title, null, "T-1", null, null, null, null, null, null));
        await shell.OpenTicketsAsync();
        Dispatcher.UIThread.RunJobs();
        await HeadlessInput.WaitUntilAsync(() => HeadlessInput.FindAll<Border>(window, "TicketRow").Count == 1);
        return HeadlessInput.FindNamed<Border>(window, "TicketRow", item.Title);
    }

    /// <summary>Right-clicks the row and clicks, or only finds, one entry of its context menu.</summary>
    private static async Task<MenuItem> ClickRowMenuAsync(MainWindow window, Control row, string menuId, bool click = true)
    {
        Dispatcher.UIThread.RunJobs();
        var point = HeadlessInput.PointIn(window, row, Math.Min(40, row.Bounds.Width / 2), row.Bounds.Height / 2);
        HeadlessInput.PressMouse(window, point, MouseButton.Right);
        HeadlessInput.ReleaseMouse(window, point, MouseButton.Right);
        await HeadlessInput.WaitUntilAsync(() => HeadlessInput.FindAll<MenuItem>(window, menuId).Count == 1);
        var menu = HeadlessInput.Find<MenuItem>(window, menuId);
        if (click)
        {
            var command = menu.Command;
            HeadlessInput.Click(window, menu);
            await WaitForCommandAsync(command);
        }

        return menu;
    }

    private static async Task WaitForCommandAsync(System.Windows.Input.ICommand? command)
    {
        var running = Assert.IsAssignableFrom<IAsyncRelayCommand>(command);
        await Assert.IsAssignableFrom<Task>(running.ExecutionTask);
        Dispatcher.UIThread.RunJobs();
    }

    private static Task<Guid?> StoredCurrentAsync(IServiceProvider services)
    {
        return services.GetRequiredService<CurrentItemService>().GetIdAsync();
    }

    private static async Task<(MainWindow Window, TodoItem Item)> OpenWorkspaceAsync(IServiceProvider services)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Release");
        var item = await services.GetRequiredService<ItemService>().CreateAsync(project.Id, null, null, "Review release notes");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = ScreenSnapshotTests.OpenWindow(shell, dark: false, height: 920);
        await shell.OpenProjectAsync(project.Id);
        Dispatcher.UIThread.RunJobs();
        return (window, item);
    }
}