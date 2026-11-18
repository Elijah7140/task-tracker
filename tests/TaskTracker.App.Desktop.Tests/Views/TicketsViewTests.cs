#pragma warning disable xUnit1051
using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Threading;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Reminders;
using TaskTracker.Core.Tickets;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests.Views;

/// <summary>Drives the Tickets screen through its real mouse and keyboard paths.</summary>
public sealed class TicketsViewTests
{
    private const RawInputModifiers ControlShift = RawInputModifiers.Control | RawInputModifiers.Shift;
    private const string Review = "Review payment reconciliation";
    private const string Fix = "Fix statement import";
    private static readonly DateOnly Due = new(2026, 11, 20);

    [AvaloniaFact]
    public async Task Home_top_bar_and_shortcut_open_tickets_with_the_same_return_page()
    {
        using var services = await TestServices.CreateAsync();
        var (shell, window) = await OpenHomeAsync(services);
        var home = shell.CurrentPage;

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "HomeTicketsButton"));
        Assert.IsType<TicketsViewModel>(shell.CurrentPage);
        Assert.True(HeadlessInput.Find<ComboBox>(window, "TicketsProjectFilter").IsFocused);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "TicketsBackButton"));
        Assert.Same(home, shell.CurrentPage);

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "TopTicketsButton"));
        Assert.IsType<TicketsViewModel>(shell.CurrentPage);
        HeadlessInput.Press(window, Key.Escape);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "HomeSearchButton"));
        HeadlessInput.Press(window, Key.K, ControlShift);
        Assert.IsType<TicketsViewModel>(shell.CurrentPage);
        HeadlessInput.Press(window, Key.Escape);

        Assert.Same(home, shell.CurrentPage);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Keyboard_moves_cross_the_section_boundary_and_keep_focus_for_the_next_move()
    {
        using var services = await TestServices.CreateAsync();
        var item = await SeedTicketsAsync(services);
        var (shell, window) = await OpenTicketsAsync(services);
        HeadlessInput.Click(window, Row(window, Review));

        HeadlessInput.Press(window, Key.Down, RawInputModifiers.Alt);
        await HeadlessInput.WaitUntilAsync(() => CurrentPriority(shell, Review) == BuiltInLookups.CriticalId);
        Assert.True(Row(window, Review).IsFocused);
        HeadlessInput.Press(window, Key.Down, RawInputModifiers.Alt);
        await HeadlessInput.WaitUntilAsync(() => FirstTitle(shell, BuiltInLookups.CriticalId) == Fix);
        HeadlessInput.Press(window, Key.Up, RawInputModifiers.Alt);
        HeadlessInput.Press(window, Key.Up, RawInputModifiers.Alt);
        await HeadlessInput.WaitUntilAsync(() => CurrentPriority(shell, Review) is null);

        Assert.Null((await ReadTicketAsync(services, item.Id)).PriorityLevelId);
        Assert.True(Row(window, Review).IsFocused);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Dragging_below_a_ticket_sets_its_priority_and_dropping_on_no_priority_clears_it()
    {
        using var services = await TestServices.CreateAsync();
        var item = await SeedTicketsAsync(services);
        var (shell, window) = await OpenTicketsAsync(services);
        var target = Row(window, Fix);
        var edge = HeadlessInput.PointIn(window, target, 40, target.Bounds.Height - 3);

        HeadlessInput.PressMouse(window, HeadlessInput.CentreOf(window, Row(window, Review)));
        HeadlessInput.MoveMouse(window, edge);
        Assert.Contains("dropAfter", target.Classes);
        HeadlessInput.ReleaseMouse(window, edge);
        await HeadlessInput.WaitUntilAsync(() => CurrentPriority(shell, Review) == BuiltInLookups.CriticalId);

        Assert.Equal(Fix, FirstTitle(shell, BuiltInLookups.CriticalId));
        var header = HeadlessInput.FindNamed<Border>(window, "TicketSection", "No priority");
        HeadlessInput.Drag(window, HeadlessInput.CentreOf(window, Row(window, Review)), HeadlessInput.CentreOf(window, header));
        await HeadlessInput.WaitUntilAsync(() => CurrentPriority(shell, Review) is null);

        Assert.Null((await ReadTicketAsync(services, item.Id)).PriorityLevelId);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Holding_a_drag_near_the_bottom_edge_reaches_an_offscreen_ticket()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var items = services.GetRequiredService<ItemService>();
        for (var index = 0; index < 36; index++)
        {
            await AddAsync(items, project.Id, $"Ticket {index}", $"T-{index}");
        }

        var (shell, window) = await OpenTicketsAsync(services);
        var scroll = HeadlessInput.Find<ScrollViewer>(window, "TicketsScrollViewer");
        var edge = HeadlessInput.PointIn(window, scroll, 40, scroll.Viewport.Height - 5);
        var offscreen = Row(window, "Ticket 35");
        Assert.True(HeadlessInput.CentreOf(window, offscreen).Y > edge.Y);

        HeadlessInput.PressMouse(window, HeadlessInput.CentreOf(window, Row(window, "Ticket 0")));
        HeadlessInput.MoveMouse(window, edge);
        await HeadlessInput.WaitUntilAsync(() => scroll.Offset.Y > 60 &&
            HeadlessInput.FindAll<Border>(window, "TicketRow").Any(row =>
                row.Classes.Contains("dropBefore") || row.Classes.Contains("dropAfter")));
        await HeadlessInput.WaitUntilAsync(() => HeadlessInput.CentreOf(window, offscreen).Y < edge.Y - 55);
        var drop = HeadlessInput.PointIn(window, offscreen, 40, offscreen.Bounds.Height - 3);
        HeadlessInput.MoveMouse(window, drop);
        Assert.Contains("dropAfter", offscreen.Classes);
        HeadlessInput.ReleaseMouse(window, drop);

        var page = Assert.IsType<TicketsViewModel>(shell.CurrentPage);
        await HeadlessInput.WaitUntilAsync(() => page.Sections[0].Rows[^1].Title == "Ticket 0");
        Assert.True(Row(window, "Ticket 0").IsFocused);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Escape_cancels_a_drag_and_leaves_the_tickets_page_open()
    {
        using var services = await TestServices.CreateAsync();
        await SeedTicketsAsync(services);
        var (shell, window) = await OpenTicketsAsync(services);
        var target = Row(window, Fix);
        var point = HeadlessInput.CentreOf(window, target);

        HeadlessInput.PressMouse(window, HeadlessInput.CentreOf(window, Row(window, Review)));
        HeadlessInput.MoveMouse(window, point);
        HeadlessInput.Press(window, Key.Escape);
        HeadlessInput.ReleaseMouse(window, point);

        Assert.IsType<TicketsViewModel>(shell.CurrentPage);
        Assert.DoesNotContain("dropAfter", target.Classes);
        Assert.Null(CurrentPriority(shell, Review));
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(Key.Apps, RawInputModifiers.None)]
    [InlineData(Key.F10, RawInputModifiers.Shift)]
    public async Task Focused_ticket_menu_opens_from_the_keyboard(Key key, RawInputModifiers modifiers)
    {
        using var services = await TestServices.CreateAsync();
        await SeedTicketsAsync(services);
        var (shell, window) = await OpenTicketsAsync(services);
        HeadlessInput.Click(window, Row(window, Review));

        window.KeyPress(key, modifiers, PhysicalKey.None, null);
        window.KeyRelease(key, modifiers, PhysicalKey.None, null);
        await HeadlessInput.WaitUntilAsync(() => HeadlessInput.FindAll<MenuItem>(window, "TicketOpenMenuItem").Count == 1);
        Assert.NotEmpty(HeadlessInput.Find<MenuItem>(window, "SetStatusMenuItem").Items);
        Assert.NotEmpty(HeadlessInput.Find<MenuItem>(window, "SetPriorityMenuItem").Items);
        Assert.True(HeadlessInput.Find<MenuItem>(window, "PushBackOneDayMenuItem").IsEffectivelyEnabled);
        HeadlessInput.Click(window, HeadlessInput.Find<MenuItem>(window, "TicketOpenMenuItem"));

        Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Setting_priority_from_the_keyboard_menu_keeps_the_ticket_focused_for_alt_down()
    {
        using var services = await TestServices.CreateAsync();
        await SeedTicketsAsync(services);
        var (shell, window) = await OpenTicketsAsync(services);
        HeadlessInput.Click(window, Row(window, Review));

        window.KeyPress(Key.Apps, RawInputModifiers.None, PhysicalKey.None, null);
        window.KeyRelease(Key.Apps, RawInputModifiers.None, PhysicalKey.None, null);
        await HeadlessInput.WaitUntilAsync(() => HeadlessInput.FindAll<MenuItem>(window, "SetPriorityMenuItem").Count == 1);
        var menu = HeadlessInput.Find<MenuItem>(window, "SetPriorityMenuItem");
        HeadlessInput.Click(window, menu);
        await HeadlessInput.WaitUntilAsync(() => menu.IsSubMenuOpen);
        HeadlessInput.Click(window, HeadlessInput.FindNamed<MenuItem>(window, "LookupChoice", "Critical"));
        await HeadlessInput.WaitUntilAsync(() => CurrentPriority(shell, Review) == BuiltInLookups.CriticalId);

        Assert.True(Row(window, Review).IsFocused);
        HeadlessInput.Press(window, Key.Down, RawInputModifiers.Alt);
        await HeadlessInput.WaitUntilAsync(() => CurrentPriority(shell, Review) == BuiltInLookups.HighId);
        Assert.Equal(BuiltInLookups.CriticalId, CurrentPriority(shell, Fix));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Selecting_a_project_from_the_filter_hides_other_tickets_and_enter_opens_a_ticket()
    {
        using var services = await TestServices.CreateAsync();
        await SeedTicketsAsync(services);
        var (shell, window) = await OpenTicketsAsync(services);

        HeadlessInput.ChooseItem(window, HeadlessInput.Find<ComboBox>(window, "TicketsProjectFilter"), "Billing");
        Assert.Equal(Review, FirstTitle(shell, null));
        Assert.DoesNotContain(HeadlessInput.FindAll<Border>(window, "TicketRow"), row =>
            (row.DataContext as TicketRowViewModel)?.Title == Fix);
        HeadlessInput.Click(window, Row(window, Review));
        HeadlessInput.Press(window, Key.Enter);

        Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Row_menus_append_to_the_new_priority_and_remove_a_ticket_marked_done()
    {
        using var services = await TestServices.CreateAsync();
        await SeedTicketsAsync(services);
        var (shell, window) = await OpenTicketsAsync(services);

        await ChooseFromMenuAsync(window, "SetPriorityMenuItem", "Critical");
        Assert.Equal(BuiltInLookups.CriticalId, CurrentPriority(shell, Review));
        Assert.Equal(Fix, FirstTitle(shell, BuiltInLookups.CriticalId));
        await ChooseFromMenuAsync(window, "SetStatusMenuItem", "Completed");

        Assert.DoesNotContain(HeadlessInput.FindAll<Border>(window, "TicketRow"), row =>
            (row.DataContext as TicketRowViewModel)?.Title == Review);
        window.Close();
    }

    private static async Task ChooseFromMenuAsync(MainWindow window, string menuId, string choice)
    {
        await OpenMenuAsync(window, Row(window, Review));
        var menu = HeadlessInput.Find<MenuItem>(window, menuId);
        HeadlessInput.Click(window, menu);
        await HeadlessInput.WaitUntilAsync(() => menu.IsSubMenuOpen);
        HeadlessInput.Click(window, HeadlessInput.FindNamed<MenuItem>(window, "LookupChoice", choice));
    }

    [AvaloniaFact]
    public async Task Push_back_shortcut_moves_the_focused_tickets_due_date()
    {
        using var services = await TestServices.CreateAsync();
        var item = await SeedTicketsAsync(services);
        var (_, window) = await OpenTicketsAsync(services);
        HeadlessInput.Click(window, Row(window, Review));

        HeadlessInput.Press(window, Key.P, ControlShift);

        Assert.Equal(Due.AddDays(1), (await ReadTicketAsync(services, item.Id)).DueDate);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    [InlineData(true, true)]
    public async Task Tickets_and_the_row_menu_match_the_approved_images(bool dark, bool showMenu)
    {
        using var services = await TestServices.CreateAsync();
        await SeedTicketsAsync(services, extraSections: true);
        var (_, window) = await OpenTicketsAsync(services, dark);
        if (showMenu)
        {
            await OpenMenuAsync(window, Row(window, Review));
        }

        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        var screen = showMenu ? "tickets-row-menu" : "tickets";
        SnapshotComparer.AssertMatches(frame, $"{screen}-{ScreenSnapshotTests.ThemeName(dark)}");
        window.Close();
    }

    private static async Task OpenMenuAsync(MainWindow window, Border row)
    {
        var point = HeadlessInput.PointIn(window, row, 40, row.Bounds.Height / 2);
        HeadlessInput.PressMouse(window, point, MouseButton.Right);
        HeadlessInput.ReleaseMouse(window, point, MouseButton.Right);
        await HeadlessInput.WaitUntilAsync(() => HeadlessInput.FindAll<MenuItem>(window, "TicketOpenMenuItem").Count == 1);
    }

    private static async Task<(MainWindowViewModel Shell, MainWindow Window)> OpenHomeAsync(IServiceProvider services,
        bool dark = false)
    {
        var shell = services.GetRequiredService<MainWindowViewModel>();
        shell.EnableReminders(services.GetRequiredService<ReminderService>());
        var window = ScreenSnapshotTests.OpenWindow(shell, dark);
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();
        return (shell, window);
    }

    private static async Task<(MainWindowViewModel Shell, MainWindow Window)> OpenTicketsAsync(IServiceProvider services,
        bool dark = false)
    {
        var (shell, window) = await OpenHomeAsync(services, dark);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "HomeTicketsButton"));
        return (shell, window);
    }

    private static Border Row(MainWindow window, string title)
    {
        return HeadlessInput.FindNamed<Border>(window, "TicketRow", title);
    }

    private static Guid? CurrentPriority(MainWindowViewModel shell, string title)
    {
        var page = Assert.IsType<TicketsViewModel>(shell.CurrentPage);
        return page.Sections.SelectMany(section => section.Rows).Single(row => row.Title == title).PriorityId;
    }

    private static string FirstTitle(MainWindowViewModel shell, Guid? priorityId)
    {
        var page = Assert.IsType<TicketsViewModel>(shell.CurrentPage);
        return page.Sections.Single(section => section.PriorityId == priorityId).Rows[0].Title;
    }

    private static async Task<TodoItem> ReadTicketAsync(IServiceProvider services, Guid id)
    {
        var board = await services.GetRequiredService<TicketService>().LoadAsync();
        return board.Sections.SelectMany(section => section.Items).Single(item => item.Id == id);
    }

    private static async Task<TodoItem> SeedTicketsAsync(IServiceProvider services, bool extraSections = false)
    {
        var projects = services.GetRequiredService<ProjectService>();
        var billing = await projects.CreateAsync("Billing");
        var portal = await projects.CreateAsync("Customer portal");
        var items = services.GetRequiredService<ItemService>();
        var review = await AddAsync(items, billing.Id, Review, "PAY-173", due: Due);
        await AddAsync(items, portal.Id, Fix, "WEB-42", BuiltInLookups.CriticalId, Due.AddDays(3));
        var lookups = services.GetRequiredService<LookupService>();
        var statuses = await lookups.StatusesAsync();
        await items.SetStatusAsync(review.Id, statuses.Single(status => status.Name == "Testing").Id);

        if (extraSections)
        {
            var hotfix = await lookups.AddPriorityLevelAsync("Hotfix", 7);
            var update = await AddAsync(items, portal.Id, "Update invoice preview", "WEB-81", hotfix.Id);
            await items.SetStatusAsync(update.Id, statuses.Single(status => status.Name == "In progress").Id);
            await lookups.SetPriorityNumberAsync(BuiltInLookups.CriticalId, 1);
        }

        return review;
    }

    private static async Task<TodoItem> AddAsync(ItemService items, Guid projectId, string title, string number,
        Guid? priority = null, DateOnly? due = null)
    {
        var item = await items.CreateAsync(projectId, null, null, title);
        await items.EditAsync(item.Id, new ItemEdit(title, null, number, null, priority, due, null, null, null));
        return item;
    }
}