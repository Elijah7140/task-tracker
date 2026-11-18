using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Threading;
using Avalonia.VisualTree;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Calendar;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Search;
using TaskTracker.Core.Settings;
using TaskTracker.Presentation.Navigation;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests.Views;

/// <summary>Rescheduling calendar entries with simulated mouse drags and Alt+arrow keys.</summary>
public sealed class CalendarDragTests
{
    private const RawInputModifiers CtrlShift = RawInputModifiers.Control | RawInputModifiers.Shift;

    private static readonly DateOnly TheThirteenth = new(2026, 11, 13);

    private static readonly DateOnly TheFourteenth = new(2026, 11, 14);

    private static readonly DateOnly TheSeventeenth = new(2026, 11, 17);

    [AvaloniaFact]
    public async Task Dragging_a_due_entry_to_another_month_cell_changes_the_date_and_keeps_the_time()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services, due: TheThirteenth, dueTime: new TimeOnly(10, 30));
        var calendar = await OpenCalendarAsync(window, services, week: false);
        var entry = HeadlessInput.Find<Button>(window, "CalendarEntryButton");
        var target = MonthCell(window, TheSeventeenth);

        HeadlessInput.Drag(window, HeadlessInput.CentreOf(window, entry), HeadlessInput.CentreOf(window, target));
        await HeadlessInput.WaitUntilAsync(() => HasEntryOn(calendar, TheSeventeenth));

        var stored = await seeded.ReadAsync(services);
        Assert.Equal(TheSeventeenth, stored.DueDate);
        Assert.Equal(new TimeOnly(10, 30), stored.DueTime);
        Assert.False(HasEntryOn(calendar, TheThirteenth));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Dragging_a_scheduled_entry_to_another_month_cell_moves_it_and_keeps_its_length()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var start = new DateTime(2026, 11, 13, 9, 0, 0);
        var seeded = await SeedAsync(services, start: start, end: start.AddMinutes(90));
        var calendar = await OpenCalendarAsync(window, services, week: false);
        var entry = HeadlessInput.Find<Button>(window, "CalendarEntryButton");
        var target = MonthCell(window, TheSeventeenth);

        HeadlessInput.Drag(window, HeadlessInput.CentreOf(window, entry), HeadlessInput.CentreOf(window, target));
        await HeadlessInput.WaitUntilAsync(() => HasEntryOn(calendar, TheSeventeenth));

        var stored = await seeded.ReadAsync(services);
        Assert.Equal(new DateTime(2026, 11, 17, 9, 0, 0), stored.ScheduledStart);
        Assert.Equal(new DateTime(2026, 11, 17, 10, 30, 0), stored.ScheduledEnd);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Month_cell_is_highlighted_while_an_entry_is_dragged_over_it_and_cleared_on_drop()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        await SeedAsync(services, due: TheThirteenth);
        var calendar = await OpenCalendarAsync(window, services, week: false);
        var entry = HeadlessInput.Find<Button>(window, "CalendarEntryButton");
        var target = MonthCell(window, TheSeventeenth);
        var targetPoint = HeadlessInput.CentreOf(window, target);

        HeadlessInput.PressMouse(window, HeadlessInput.CentreOf(window, entry));
        HeadlessInput.MoveMouse(window, targetPoint);

        Assert.Contains("dropTarget", target.Classes);
        HeadlessInput.ReleaseMouse(window, targetPoint);
        await HeadlessInput.WaitUntilAsync(() => HasEntryOn(calendar, TheSeventeenth));
        Assert.DoesNotContain(HeadlessInput.FindAll<Border>(window, "CalendarDayCell"),
            cell => cell.Classes.Contains("dropTarget"));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Dragging_a_block_in_the_week_grid_moves_it_to_the_snapped_time_and_day()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var start = new DateTime(2026, 11, 13, 9, 0, 0);
        var seeded = await SeedAsync(services, start: start, end: start.AddHours(1));
        var calendar = await OpenCalendarAsync(window, services, week: true);
        var block = HeadlessInput.Find<Button>(window, "CalendarEntryButton");
        var column = TimeColumn(window, TheFourteenth);
        const double grabOffset = 20;
        var pressPoint = HeadlessInput.PointIn(window, block, block.Bounds.Width / 2, grabOffset);
        var dropY = CalendarMetrics.OffsetOf(new TimeOnly(11, 30)) + grabOffset + 3;
        var dropPoint = HeadlessInput.PointIn(window, column, column.Bounds.Width / 2, dropY);

        HeadlessInput.PressMouse(window, pressPoint);
        HeadlessInput.MoveMouse(window, dropPoint);

        Assert.True(HeadlessInput.Find<Grid>(window, "CalendarDropIndicator").IsVisible);
        Assert.Equal("11:30", HeadlessInput.Find<TextBlock>(window, "CalendarDropTime").Text);
        HeadlessInput.ReleaseMouse(window, dropPoint);
        await HeadlessInput.WaitUntilAsync(() => HasEntryOn(calendar, TheFourteenth));
        var stored = await seeded.ReadAsync(services);
        Assert.Equal(new DateTime(2026, 11, 14, 11, 30, 0), stored.ScheduledStart);
        Assert.Equal(new DateTime(2026, 11, 14, 12, 30, 0), stored.ScheduledEnd);
        Assert.Empty(HeadlessInput.FindAll<Grid>(window, "CalendarDropIndicator"));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Dragging_an_all_day_entry_into_the_week_grid_makes_it_timed()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services, due: TheThirteenth);
        var calendar = await OpenCalendarAsync(window, services, week: true);
        var entry = HeadlessInput.Find<Button>(window, "CalendarEntryButton");
        var column = TimeColumn(window, TheFourteenth);
        var dropY = CalendarMetrics.OffsetOf(new TimeOnly(15, 0)) + 2;
        var dropPoint = HeadlessInput.PointIn(window, column, column.Bounds.Width / 2, dropY);

        HeadlessInput.Drag(window, HeadlessInput.CentreOf(window, entry), dropPoint);
        await HeadlessInput.WaitUntilAsync(() => HasEntryOn(calendar, TheFourteenth));

        var stored = await seeded.ReadAsync(services);
        Assert.Equal(TheFourteenth, stored.DueDate);
        Assert.Equal(new TimeOnly(15, 0), stored.DueTime);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Dragging_a_timed_due_marker_to_the_all_day_row_clears_its_time()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services, due: TheThirteenth, dueTime: new TimeOnly(14, 0));
        var calendar = await OpenCalendarAsync(window, services, week: true);
        var marker = HeadlessInput.Find<Button>(window, "CalendarEntryButton");
        var allDayCell = HeadlessInput.FindNamed<Border>(window, "CalendarAllDayCell", "2026-11-14");

        HeadlessInput.Drag(window, HeadlessInput.CentreOf(window, marker), HeadlessInput.CentreOf(window, allDayCell));
        await HeadlessInput.WaitUntilAsync(() => HasEntryOn(calendar, TheFourteenth));

        var stored = await seeded.ReadAsync(services);
        Assert.Equal(TheFourteenth, stored.DueDate);
        Assert.Null(stored.DueTime);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Dragging_an_all_day_entry_to_another_all_day_cell_changes_only_the_date()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services, due: TheThirteenth);
        var calendar = await OpenCalendarAsync(window, services, week: true);
        var entry = HeadlessInput.Find<Button>(window, "CalendarEntryButton");
        var allDayCell = HeadlessInput.FindNamed<Border>(window, "CalendarAllDayCell", "2026-11-14");

        HeadlessInput.Drag(window, HeadlessInput.CentreOf(window, entry), HeadlessInput.CentreOf(window, allDayCell));
        await HeadlessInput.WaitUntilAsync(() => HasEntryOn(calendar, TheFourteenth));

        var stored = await seeded.ReadAsync(services);
        Assert.Equal(TheFourteenth, stored.DueDate);
        Assert.Null(stored.DueTime);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Dropping_a_scheduled_block_on_the_all_day_row_is_ignored()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var start = new DateTime(2026, 11, 13, 9, 0, 0);
        var seeded = await SeedAsync(services, start: start, end: start.AddHours(1));
        var calendar = await OpenCalendarAsync(window, services, week: true);
        var block = HeadlessInput.Find<Button>(window, "CalendarEntryButton");
        var allDayCell = HeadlessInput.FindNamed<Border>(window, "CalendarAllDayCell", "2026-11-14");
        var cellPoint = HeadlessInput.CentreOf(window, allDayCell);

        HeadlessInput.PressMouse(window, HeadlessInput.CentreOf(window, block));
        HeadlessInput.MoveMouse(window, cellPoint);
        Assert.DoesNotContain("dropTarget", allDayCell.Classes);
        HeadlessInput.ReleaseMouse(window, cellPoint);
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();

        var stored = await seeded.ReadAsync(services);
        Assert.Equal(start, stored.ScheduledStart);
        Assert.True(HasEntryOn(calendar, TheThirteenth));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Dropping_a_block_at_the_bottom_of_the_grid_keeps_its_start_inside_the_day()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var start = new DateTime(2026, 11, 13, 22, 0, 0);
        var seeded = await SeedAsync(services, start: start, end: start.AddHours(1));
        var calendar = await OpenCalendarAsync(window, services, week: true);
        ScrollWeekGridToEnd(window);
        var block = HeadlessInput.Find<Button>(window, "CalendarEntryButton");
        var column = TimeColumn(window, TheFourteenth);
        var pressPoint = HeadlessInput.PointIn(window, block, block.Bounds.Width / 2, 2);
        var bottom = HeadlessInput.PointIn(window, column, column.Bounds.Width / 2, CalendarMetrics.DayHeight - 2);

        HeadlessInput.Drag(window, pressPoint, bottom);
        await HeadlessInput.WaitUntilAsync(() => HasEntryOn(calendar, TheFourteenth));

        var stored = await seeded.ReadAsync(services);
        Assert.Equal(new DateTime(2026, 11, 14, 23, 45, 0), stored.ScheduledStart);
        Assert.Equal(new DateTime(2026, 11, 15, 0, 45, 0), stored.ScheduledEnd);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Escape_cancels_a_drag_without_saving_or_leaving_the_calendar()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services, due: TheThirteenth);
        var shell = ShowShell(window, services);
        var calendar = await OpenCalendarAsync(window, services, week: false);
        var entry = HeadlessInput.Find<Button>(window, "CalendarEntryButton");
        var target = MonthCell(window, TheSeventeenth);
        var targetPoint = HeadlessInput.CentreOf(window, target);

        HeadlessInput.PressMouse(window, HeadlessInput.CentreOf(window, entry));
        HeadlessInput.MoveMouse(window, targetPoint);
        Assert.Contains("dropTarget", target.Classes);
        HeadlessInput.Press(window, Key.Escape);
        HeadlessInput.ReleaseMouse(window, targetPoint);
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();

        Assert.DoesNotContain("dropTarget", target.Classes);
        Assert.Same(calendar, shell.CurrentPage);
        Assert.Equal(TheThirteenth, (await seeded.ReadAsync(services)).DueDate);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Releasing_outside_every_drop_area_saves_nothing()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services, due: TheThirteenth);
        var calendar = await OpenCalendarAsync(window, services, week: false);
        var entry = HeadlessInput.Find<Button>(window, "CalendarEntryButton");
        var backButton = HeadlessInput.Find<Button>(window, "CalendarBackButton");

        HeadlessInput.Drag(window, HeadlessInput.CentreOf(window, entry), HeadlessInput.CentreOf(window, backButton));
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();

        Assert.Equal(TheThirteenth, (await seeded.ReadAsync(services)).DueDate);
        Assert.True(HasEntryOn(calendar, TheThirteenth));
        window.Close();
    }

    [AvaloniaFact]
    public async Task A_tiny_pointer_movement_is_still_a_click_that_opens_the_item()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services, due: TheThirteenth);
        var shell = ShowShell(window, services);
        await OpenCalendarAsync(window, services, week: false);
        var entry = HeadlessInput.Find<Button>(window, "CalendarEntryButton");
        var centre = HeadlessInput.CentreOf(window, entry);

        HeadlessInput.PressMouse(window, centre);
        HeadlessInput.MoveMouse(window, centre + new Point(2, 1));
        HeadlessInput.ReleaseMouse(window, centre + new Point(2, 1));
        await HeadlessInput.WaitUntilAsync(() => shell.CurrentPage is ProjectWorkspaceViewModel);

        var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        Assert.Equal(seeded.ItemId, workspace.Editor?.Id);
        Assert.Equal(TheThirteenth, (await seeded.ReadAsync(services)).DueDate);
        window.Close();
    }

    [AvaloniaFact]
    public async Task A_completed_entry_can_be_dragged_and_stays_completed()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services, due: TheThirteenth, complete: true);
        var calendar = await OpenCalendarAsync(window, services, week: false);
        calendar.IncludeCompleted = true;
        await HeadlessInput.WaitUntilAsync(() => HasEntryOn(calendar, TheThirteenth));
        Dispatcher.UIThread.RunJobs();
        var entry = HeadlessInput.Find<Button>(window, "CalendarEntryButton");
        var target = MonthCell(window, TheSeventeenth);

        HeadlessInput.Drag(window, HeadlessInput.CentreOf(window, entry), HeadlessInput.CentreOf(window, target));
        await HeadlessInput.WaitUntilAsync(() => HasEntryOn(calendar, TheSeventeenth));

        var stored = await seeded.ReadAsync(services);
        Assert.Equal(TheSeventeenth, stored.DueDate);
        Assert.NotNull(stored.CompletedAtUtc);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Dropping_an_entry_whose_item_was_deleted_reloads_and_reports_it()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services, due: TheThirteenth);
        var calendar = await OpenCalendarAsync(window, services, week: false);
        var entry = HeadlessInput.Find<Button>(window, "CalendarEntryButton");
        var target = MonthCell(window, TheSeventeenth);
        await services.GetRequiredService<ItemService>().DeleteAsync(seeded.ProjectId, null, seeded.ItemId);

        HeadlessInput.Drag(window, HeadlessInput.CentreOf(window, entry), HeadlessInput.CentreOf(window, target));
        await HeadlessInput.WaitUntilAsync(() => calendar.Error is not null);

        Assert.Equal("Item is missing or deleted.", HeadlessInput.Find<TextBlock>(window, "CalendarErrorText").Text);
        Assert.Empty(calendar.Days.SelectMany(day => day.Entries));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Alt_Right_moves_the_focused_entry_a_day_and_keeps_focus_on_it()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services, due: TheThirteenth);
        var calendar = await OpenCalendarAsync(window, services, week: false);
        HeadlessInput.Find<Button>(window, "CalendarEntryButton").Focus();

        HeadlessInput.Press(window, Key.Right, RawInputModifiers.Alt);
        await HeadlessInput.WaitUntilAsync(() => HasEntryOn(calendar, TheFourteenth) && FocusedEntryDay(window) == TheFourteenth);

        Assert.Equal(TheFourteenth, (await seeded.ReadAsync(services)).DueDate);
        HeadlessInput.Press(window, Key.Left, RawInputModifiers.Alt);
        await HeadlessInput.WaitUntilAsync(() => HasEntryOn(calendar, TheThirteenth) && FocusedEntryDay(window) == TheThirteenth);
        Assert.Equal(TheThirteenth, (await seeded.ReadAsync(services)).DueDate);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Alt_Down_and_Alt_Up_move_a_timed_entry_by_fifteen_minutes_in_week_view()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services, due: TheThirteenth, dueTime: new TimeOnly(14, 0));
        var calendar = await OpenCalendarAsync(window, services, week: true);
        HeadlessInput.Find<Button>(window, "CalendarEntryButton").Focus();

        HeadlessInput.Press(window, Key.Down, RawInputModifiers.Alt);
        await HeadlessInput.WaitUntilAsync(() => FocusedEntryStart(window) == new TimeOnly(14, 15));
        HeadlessInput.Press(window, Key.Up, RawInputModifiers.Alt);
        HeadlessInput.Press(window, Key.Up, RawInputModifiers.Alt);
        await HeadlessInput.WaitUntilAsync(() => FocusedEntryStart(window) == new TimeOnly(13, 45));

        Assert.Equal(new TimeOnly(13, 45), (await seeded.ReadAsync(services)).DueTime);
        Assert.True(HasEntryOn(calendar, TheThirteenth));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Alt_Down_moves_a_scheduled_block_in_month_view_too()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var start = new DateTime(2026, 11, 13, 9, 0, 0);
        var seeded = await SeedAsync(services, start: start, end: start.AddHours(1));
        await OpenCalendarAsync(window, services, week: false);
        HeadlessInput.Find<Button>(window, "CalendarEntryButton").Focus();

        HeadlessInput.Press(window, Key.Down, RawInputModifiers.Alt);
        await HeadlessInput.WaitUntilAsync(() => FocusedEntryStart(window) == new TimeOnly(9, 15));

        var stored = await seeded.ReadAsync(services);
        Assert.Equal(start.AddMinutes(15), stored.ScheduledStart);
        Assert.Equal(start.AddMinutes(75), stored.ScheduledEnd);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Alt_Up_and_Alt_Down_do_nothing_for_an_all_day_entry()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services, due: TheThirteenth);
        var shell = ShowShell(window, services);
        var calendar = await OpenCalendarAsync(window, services, week: false);
        HeadlessInput.Find<Button>(window, "CalendarEntryButton").Focus();

        HeadlessInput.Press(window, Key.Down, RawInputModifiers.Alt);
        HeadlessInput.Press(window, Key.Up, RawInputModifiers.Alt);
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();

        var stored = await seeded.ReadAsync(services);
        Assert.Equal(TheThirteenth, stored.DueDate);
        Assert.Null(stored.DueTime);
        Assert.Same(calendar, shell.CurrentPage);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(Key.Right, RawInputModifiers.None)]
    [InlineData(Key.Right, RawInputModifiers.Control)]
    [InlineData(Key.Right, RawInputModifiers.Alt | RawInputModifiers.Shift)]
    public async Task Arrow_keys_without_exactly_Alt_do_not_move_an_entry(Key key, RawInputModifiers modifiers)
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services, due: TheThirteenth);
        await OpenCalendarAsync(window, services, week: false);
        HeadlessInput.Find<Button>(window, "CalendarEntryButton").Focus();

        HeadlessInput.Press(window, key, modifiers);
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();

        Assert.Equal(TheThirteenth, (await seeded.ReadAsync(services)).DueDate);
        window.Close();
    }

    [AvaloniaFact]
    public async Task A_lost_button_release_does_not_turn_the_next_hover_into_a_drag()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services, due: TheThirteenth);
        await OpenCalendarAsync(window, services, week: false);
        var entry = HeadlessInput.Find<Button>(window, "CalendarEntryButton");
        var target = MonthCell(window, TheSeventeenth);
        var targetPoint = HeadlessInput.CentreOf(window, target);

        HeadlessInput.PressMouse(window, HeadlessInput.CentreOf(window, entry));
        HeadlessInput.MoveMouse(window, targetPoint, RawInputModifiers.None);
        Dispatcher.UIThread.RunJobs();
        HeadlessInput.MoveMouse(window, targetPoint);

        Assert.DoesNotContain("dropTarget", target.Classes);
        HeadlessInput.ReleaseMouse(window, targetPoint);
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(TheThirteenth, (await seeded.ReadAsync(services)).DueDate);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(MouseButton.Right, RawInputModifiers.RightMouseButton)]
    [InlineData(MouseButton.Middle, RawInputModifiers.MiddleMouseButton)]
    public async Task Pressing_another_mouse_button_on_an_entry_does_not_start_a_drag(
        MouseButton button, RawInputModifiers held)
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services, due: TheThirteenth);
        await OpenCalendarAsync(window, services, week: false);
        var entry = HeadlessInput.Find<Button>(window, "CalendarEntryButton");
        var target = MonthCell(window, TheSeventeenth);
        var targetPoint = HeadlessInput.CentreOf(window, target);

        HeadlessInput.PressMouse(window, HeadlessInput.CentreOf(window, entry), button);
        HeadlessInput.MoveMouse(window, targetPoint, held);
        Dispatcher.UIThread.RunJobs();

        Assert.DoesNotContain("dropTarget", target.Classes);
        HeadlessInput.ReleaseMouse(window, targetPoint, button);
        Dispatcher.UIThread.RunJobs();
        await Task.Delay(100);
        Assert.Equal(TheThirteenth, (await seeded.ReadAsync(services)).DueDate);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Releasing_the_right_button_mid_drag_does_not_drop_the_entry()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services, due: TheThirteenth);
        var calendar = await OpenCalendarAsync(window, services, week: false);
        var entry = HeadlessInput.Find<Button>(window, "CalendarEntryButton");
        var target = MonthCell(window, TheSeventeenth);
        var targetPoint = HeadlessInput.CentreOf(window, target);
        HeadlessInput.PressMouse(window, HeadlessInput.CentreOf(window, entry));
        HeadlessInput.MoveMouse(window, targetPoint);

        HeadlessInput.PressMouse(window, targetPoint, MouseButton.Right, RawInputModifiers.LeftMouseButton);
        HeadlessInput.ReleaseMouse(window, targetPoint, MouseButton.Right, RawInputModifiers.LeftMouseButton);
        Dispatcher.UIThread.RunJobs();
        await Task.Delay(100);

        Assert.Contains("dropTarget", target.Classes);
        Assert.Equal(TheThirteenth, (await seeded.ReadAsync(services)).DueDate);
        HeadlessInput.ReleaseMouse(window, targetPoint);
        await HeadlessInput.WaitUntilAsync(() => HasEntryOn(calendar, TheSeventeenth));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Scrolling_the_week_grid_during_a_drag_updates_the_ghost_time()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var start = new DateTime(2026, 11, 13, 9, 0, 0);
        await SeedAsync(services, start: start, end: start.AddHours(1));
        await OpenCalendarAsync(window, services, week: true);
        var block = HeadlessInput.Find<Button>(window, "CalendarEntryButton");
        var column = TimeColumn(window, TheFourteenth);
        var scroll = window.GetVisualDescendants().OfType<ScrollViewer>().First(viewer => viewer.Name == "WeekScroll");
        var dropY = CalendarMetrics.OffsetOf(new TimeOnly(11, 30)) + 12;
        var pointer = HeadlessInput.PointIn(window, column, column.Bounds.Width / 2, dropY);
        HeadlessInput.PressMouse(window, HeadlessInput.PointIn(window, block, block.Bounds.Width / 2, 12));
        HeadlessInput.MoveMouse(window, pointer);
        Assert.Equal("11:30", HeadlessInput.Find<TextBlock>(window, "CalendarDropTime").Text);
        var offsetBefore = scroll.Offset.Y;

        HeadlessInput.Wheel(window, pointer, -1);
        window.UpdateLayout();
        Dispatcher.UIThread.RunJobs();

        Assert.True(scroll.Offset.Y > offsetBefore);
        var ghostTime = TimeOnly.Parse(HeadlessInput.Find<TextBlock>(window, "CalendarDropTime").Text!);
        Assert.True(ghostTime > new TimeOnly(11, 30));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Losing_the_pointer_capture_during_a_drag_cancels_it_and_saves_nothing()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services, due: TheThirteenth);
        await OpenCalendarAsync(window, services, week: false);
        var entry = HeadlessInput.Find<Button>(window, "CalendarEntryButton");
        var target = MonthCell(window, TheSeventeenth);
        var targetPoint = HeadlessInput.CentreOf(window, target);
        IPointer? pointer = null;
        window.AddHandler(InputElement.PointerMovedEvent, (_, args) => pointer = args.Pointer,
            Avalonia.Interactivity.RoutingStrategies.Tunnel, true);
        HeadlessInput.PressMouse(window, HeadlessInput.CentreOf(window, entry));
        HeadlessInput.MoveMouse(window, targetPoint);
        Assert.Contains("dropTarget", target.Classes);

        pointer!.Capture(null);
        Dispatcher.UIThread.RunJobs();

        Assert.DoesNotContain("dropTarget", target.Classes);
        HeadlessInput.ReleaseMouse(window, targetPoint);
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(TheThirteenth, (await seeded.ReadAsync(services)).DueDate);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(MouseButton.Right, RawInputModifiers.RightMouseButton)]
    [InlineData(MouseButton.Middle, RawInputModifiers.MiddleMouseButton)]
    public async Task Pressing_another_button_while_left_is_held_on_empty_space_does_not_arm_a_drag(
        MouseButton extraButton, RawInputModifiers extraHeld)
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services, due: TheThirteenth);
        await OpenCalendarAsync(window, services, week: false);
        var entry = HeadlessInput.Find<Button>(window, "CalendarEntryButton");
        var emptySpot = HeadlessInput.PointIn(window, MonthCell(window, TheSeventeenth), 6, 6);
        var target = MonthCell(window, TheSeventeenth);
        var targetPoint = HeadlessInput.CentreOf(window, target);
        var held = RawInputModifiers.LeftMouseButton | extraHeld;

        HeadlessInput.PressMouse(window, emptySpot);
        HeadlessInput.PressMouse(window, HeadlessInput.CentreOf(window, entry), extraButton,
            RawInputModifiers.LeftMouseButton);
        HeadlessInput.MoveMouse(window, targetPoint, held);

        Assert.DoesNotContain("dropTarget", target.Classes);
        HeadlessInput.ReleaseMouse(window, targetPoint, extraButton, RawInputModifiers.LeftMouseButton);
        HeadlessInput.ReleaseMouse(window, targetPoint);
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(TheThirteenth, (await seeded.ReadAsync(services)).DueDate);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Pressing_the_right_button_on_another_entry_mid_gesture_keeps_dragging_the_first_entry()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var first = await SeedAsync(services, due: TheThirteenth, title: "First entry");
        var second = await SeedAsync(services, due: TheThirteenth, title: "Second entry");
        var calendar = await OpenCalendarAsync(window, services, week: false);
        var firstButton = HeadlessInput.FindNamed<Button>(window, "CalendarEntryButton", "First entry");
        var secondButton = HeadlessInput.FindNamed<Button>(window, "CalendarEntryButton", "Second entry");
        var targetPoint = HeadlessInput.CentreOf(window, MonthCell(window, TheSeventeenth));

        HeadlessInput.PressMouse(window, HeadlessInput.CentreOf(window, firstButton));
        HeadlessInput.PressMouse(window, HeadlessInput.CentreOf(window, secondButton), MouseButton.Right,
            RawInputModifiers.LeftMouseButton);
        HeadlessInput.MoveMouse(window, targetPoint, RawInputModifiers.LeftMouseButton | RawInputModifiers.RightMouseButton);
        HeadlessInput.ReleaseMouse(window, targetPoint, MouseButton.Right, RawInputModifiers.LeftMouseButton);
        HeadlessInput.ReleaseMouse(window, targetPoint);
        await HeadlessInput.WaitUntilAsync(() => HasEntryOn(calendar, TheSeventeenth));

        Assert.Equal(TheSeventeenth, (await first.ReadAsync(services)).DueDate);
        Assert.Equal(TheThirteenth, (await second.ReadAsync(services)).DueDate);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Holding_Alt_Right_while_a_save_is_pending_adds_up_the_steps_across_the_period_boundary()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var held = new HeldCalendarRescheduler(services.GetRequiredService<ICalendarRescheduler>());
        var shell = ShowShellWithHeldSaves(window, services, held);
        await shell.GoHomeAsync();
        HeadlessInput.Press(window, Key.C, CtrlShift);
        var calendar = Assert.IsType<CalendarViewModel>(shell.CurrentPage);
        await HeadlessInput.WaitUntilAsync(() => calendar.Days.Count == 42);
        var lastVisibleDay = calendar.Days[^1].Date;
        var seeded = await SeedAsync(services, due: lastVisibleDay);
        await calendar.LoadAsync();
        window.UpdateLayout();
        Dispatcher.UIThread.RunJobs();
        HeadlessInput.Find<Button>(window, "CalendarEntryButton").Focus();
        held.Hold();

        HeadlessInput.Press(window, Key.Right, RawInputModifiers.Alt);
        HeadlessInput.Press(window, Key.Right, RawInputModifiers.Alt);
        HeadlessInput.Press(window, Key.Right, RawInputModifiers.Alt);
        HeadlessInput.Press(window, Key.Right, RawInputModifiers.Alt);
        await HeadlessInput.WaitUntilAsync(() => held.MovesStarted == 1);
        held.Release();
        await HeadlessInput.WaitUntilAsync(() => held.MovesStarted == 2);
        var stored = await WaitForDueDateAsync(seeded, services, lastVisibleDay.AddDays(4));

        Assert.Equal(lastVisibleDay.AddDays(4), stored);
        Assert.Equal(2, held.MovesStarted);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Back_shows_the_new_date_when_a_calendar_move_is_still_pending()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services, due: TheThirteenth);
        var held = new HeldCalendarRescheduler(services.GetRequiredService<ICalendarRescheduler>());
        var shell = ShowShellWithHeldSaves(window, services, held);
        await shell.OpenProjectAsync(seeded.ProjectId);
        var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        await shell.OpenCalendarAsync();
        Dispatcher.UIThread.RunJobs();
        Assert.True(HeadlessInput.Find<Button>(window, "CalendarEntryButton").Focus());
        held.Hold();

        HeadlessInput.Press(window, Key.Right, RawInputModifiers.Alt);
        Assert.Equal(1, held.MovesStarted);
        HeadlessInput.Press(window, Key.Escape);
        held.Release();
        await HeadlessInput.WaitUntilAsync(() => ReferenceEquals(workspace, shell.CurrentPage));

        Assert.Equal(TheFourteenth, Assert.Single(workspace.OpenItems).Node.Item.DueDate);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Dragging_from_the_more_button_does_not_start_a_drag()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services, due: TheThirteenth, title: "A");
        await SeedAsync(services, due: TheThirteenth, title: "B");
        await SeedAsync(services, due: TheThirteenth, title: "C");
        await SeedAsync(services, due: TheThirteenth, title: "D");
        var calendar = await OpenCalendarAsync(window, services, week: false);
        var more = HeadlessInput.Find<Button>(window, "CalendarMoreButton");
        var target = MonthCell(window, TheSeventeenth);
        var targetPoint = HeadlessInput.CentreOf(window, target);

        HeadlessInput.PressMouse(window, HeadlessInput.CentreOf(window, more));
        HeadlessInput.MoveMouse(window, targetPoint);

        Assert.DoesNotContain("dropTarget", target.Classes);
        HeadlessInput.ReleaseMouse(window, targetPoint);
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.False(HasEntryOn(calendar, TheSeventeenth));
        Assert.Equal(TheThirteenth, (await seeded.ReadAsync(services)).DueDate);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Dragging_from_the_scrollbar_does_not_start_a_drag()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedAsync(services, due: TheThirteenth, dueTime: new TimeOnly(9, 0));
        var calendar = await OpenCalendarAsync(window, services, week: true);
        var scroll = window.GetVisualDescendants().OfType<ScrollViewer>().First(viewer => viewer.Name == "WeekScroll");
        var bar = scroll.GetVisualDescendants().OfType<ScrollBar>()
            .First(candidate => candidate.Orientation == Orientation.Vertical);
        var column = TimeColumn(window, TheFourteenth);
        var columnPoint = HeadlessInput.PointIn(window, column, column.Bounds.Width / 2, 500);

        HeadlessInput.PressMouse(window, HeadlessInput.CentreOf(window, bar));
        HeadlessInput.MoveMouse(window, columnPoint);

        Assert.Empty(HeadlessInput.FindAll<Grid>(window, "CalendarDropIndicator"));
        HeadlessInput.ReleaseMouse(window, columnPoint);
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(TheThirteenth, (await seeded.ReadAsync(services)).DueDate);
        Assert.True(HasEntryOn(calendar, TheThirteenth));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Hovering_an_entry_over_an_all_day_cell_outlines_it_without_changing_the_layout()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        await SeedAsync(services, due: TheThirteenth);
        await OpenCalendarAsync(window, services, week: true);
        var entry = HeadlessInput.Find<Button>(window, "CalendarEntryButton");
        var cell = HeadlessInput.FindNamed<Border>(window, "CalendarAllDayCell", "2026-11-14");
        var scroll = window.GetVisualDescendants().OfType<ScrollViewer>().First(viewer => viewer.Name == "WeekScroll");
        var cellBefore = cell.Bounds;
        var gridTopBefore = HeadlessInput.PointIn(window, scroll, 0, 0).Y;
        var entryBefore = entry.Bounds;

        HeadlessInput.PressMouse(window, HeadlessInput.CentreOf(window, entry));
        HeadlessInput.MoveMouse(window, HeadlessInput.CentreOf(window, cell));
        window.UpdateLayout();

        Assert.Contains("dropTarget", cell.Classes);
        Assert.Equal(cellBefore, cell.Bounds);
        Assert.Equal(gridTopBefore, HeadlessInput.PointIn(window, scroll, 0, 0).Y);
        Assert.Equal(entryBefore, entry.Bounds);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Every_drop_area_class_name_is_still_on_a_control_in_the_view()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var calendar = await OpenCalendarAsync(window, services, week: false);
        Assert.NotEmpty(DropAreasWithClass(window, CalendarDropAreas.MonthCell));

        HeadlessInput.Press(window, Key.W, CtrlShift);
        await HeadlessInput.WaitUntilAsync(() => calendar.IsWeek);
        window.UpdateLayout();
        Dispatcher.UIThread.RunJobs();

        Assert.NotEmpty(DropAreasWithClass(window, CalendarDropAreas.AllDayCell));
        Assert.NotEmpty(DropAreasWithClass(window, CalendarDropAreas.TimeColumn));
        window.Close();
    }

    private static IEnumerable<Control> DropAreasWithClass(Window window, string className)
    {
        return window.GetVisualDescendants().OfType<Control>()
            .Where(control => control.IsEffectivelyVisible && control.Classes.Contains(className)
                && control.DataContext is CalendarDayViewModel);
    }

    [AvaloniaFact]
    public async Task Alt_Left_Up_and_Down_move_a_block_that_crosses_midnight_as_a_whole()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var start = new DateTime(2026, 11, 13, 23, 0, 0);
        var seeded = await SeedAsync(services, start: start, end: start.AddHours(2));
        await OpenCalendarAsync(window, services, week: true);
        FocusBlockOn(window, TheThirteenth);

        HeadlessInput.Press(window, Key.Down, RawInputModifiers.Alt);
        await HeadlessInput.WaitUntilAsync(() => FocusedEntryStart(window) == new TimeOnly(23, 15));
        HeadlessInput.Press(window, Key.Up, RawInputModifiers.Alt);
        await HeadlessInput.WaitUntilAsync(() => FocusedEntryStart(window) == new TimeOnly(23, 0));
        HeadlessInput.Press(window, Key.Up, RawInputModifiers.Alt);
        await HeadlessInput.WaitUntilAsync(() => FocusedEntryStart(window) == new TimeOnly(22, 45));
        HeadlessInput.Press(window, Key.Left, RawInputModifiers.Alt);
        await HeadlessInput.WaitUntilAsync(() => FocusedEntryDay(window) == new DateOnly(2026, 11, 12));

        var stored = await seeded.ReadAsync(services);
        Assert.Equal(new DateTime(2026, 11, 12, 22, 45, 0), stored.ScheduledStart);
        Assert.Equal(new DateTime(2026, 11, 13, 0, 45, 0), stored.ScheduledEnd);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Moving_an_entry_under_its_days_more_button_leaves_focus_on_that_button()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        await SeedAsync(services, due: TheThirteenth, title: "A");
        await SeedAsync(services, due: TheThirteenth, title: "B");
        await SeedAsync(services, due: TheThirteenth, title: "C");
        await SeedAsync(services, due: new DateOnly(2026, 11, 12), title: "Zed");
        await OpenCalendarAsync(window, services, week: false);
        HeadlessInput.FindNamed<Button>(window, "CalendarEntryButton", "Zed").Focus();

        HeadlessInput.Press(window, Key.Right, RawInputModifiers.Alt);
        await HeadlessInput.WaitUntilAsync(() => FocusedAutomationId(window) == "CalendarMoreButton");

        Assert.Equal("+1 more", (window.FocusManager?.GetFocusedElement() as Button)?.Content);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData("2026-12-12", Key.Right, "CalendarNextButton")]
    [InlineData("2026-11-01", Key.Left, "CalendarPreviousButton")]
    public async Task Moving_an_entry_out_of_the_visible_period_leaves_focus_on_the_period_button(
        string due, Key key, string expectedFocusId)
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        await SeedAsync(services, due: DateOnly.Parse(due));
        await OpenCalendarAsync(window, services, week: false);
        HeadlessInput.Find<Button>(window, "CalendarEntryButton").Focus();

        HeadlessInput.Press(window, key, RawInputModifiers.Alt);
        await HeadlessInput.WaitUntilAsync(() => FocusedAutomationId(window) == expectedFocusId);

        window.Close();
    }

    private static void FocusBlockOn(Window window, DateOnly day)
    {
        var block = HeadlessInput.FindAll<Button>(window, "CalendarEntryButton")
            .First(button => (button.DataContext as CalendarEntryViewModel)?.Day == day);
        block.Focus();
    }

    private static string? FocusedAutomationId(Window window)
    {
        var focused = window.FocusManager?.GetFocusedElement() as Control;
        return focused is null ? null : Avalonia.Automation.AutomationProperties.GetAutomationId(focused);
    }

    /// <summary>A shell like the real one, except that rescheduling saves can be held back by <paramref name="held"/>.</summary>
    private static MainWindowViewModel ShowShellWithHeldSaves(
        MainWindow window, IServiceProvider services, HeldCalendarRescheduler held)
    {
        var shell = new MainWindowViewModel(
            services.GetRequiredService<ProjectService>(), services.GetRequiredService<FolderService>(),
            services.GetRequiredService<IDialogService>(), services.GetRequiredService<ItemService>(),
            services.GetRequiredService<TimeProvider>(), services.GetRequiredService<TimeZoneInfo>(),
            settings: services.GetRequiredService<SettingsService>(),
            lookups: services.GetRequiredService<LookupService>(),
            fields: services.GetRequiredService<FieldService>(),
            search: services.GetRequiredService<IItemSearchService>(),
            registry: services.GetRequiredService<IFieldRegistry>(),
            calendar: services.GetRequiredService<CalendarService>(),
            rescheduler: held, saves: services.GetRequiredService<DataSaved>());
        window.DataContext = shell;
        window.Show();
        return shell;
    }

    /// <summary>Reads the stored due date until it equals the expected one (a save may still be finishing).</summary>
    private static async Task<DateOnly?> WaitForDueDateAsync(
        SeededItem seeded, IServiceProvider services, DateOnly expected)
    {
        DateOnly? stored = null;

        for (var attempt = 0; attempt < 300 && stored != expected; attempt++)
        {
            await Task.Delay(10);
            Dispatcher.UIThread.RunJobs();
            stored = (await seeded.ReadAsync(services)).DueDate;
        }

        return stored;
    }

    private static MainWindowViewModel ShowShell(MainWindow window, IServiceProvider services)
    {
        var shell = services.GetRequiredService<MainWindowViewModel>();

        if (window.DataContext is null)
        {
            window.DataContext = shell;
            window.Show();
        }

        return shell;
    }

    /// <summary>Opens the all-projects calendar from Home with the keyboard shortcut, optionally in week view.</summary>
    private static async Task<CalendarViewModel> OpenCalendarAsync(MainWindow window, IServiceProvider services, bool week)
    {
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        HeadlessInput.Press(window, Key.C, CtrlShift);
        var calendar = Assert.IsType<CalendarViewModel>(shell.CurrentPage);

        if (week)
        {
            HeadlessInput.Press(window, Key.W, CtrlShift);
        }

        await HeadlessInput.WaitUntilAsync(() => calendar.Days.Count == (week ? 7 : 42));
        window.UpdateLayout();
        Dispatcher.UIThread.RunJobs();
        return calendar;
    }

    private static async Task<SeededItem> SeedAsync(IServiceProvider services, DateOnly? due = null,
        TimeOnly? dueTime = null, DateTime? start = null, DateTime? end = null, bool complete = false,
        string title = "Movable item")
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project " + title);
        var items = services.GetRequiredService<ItemService>();
        var item = await items.CreateAsync(project.Id, null, null, title);
        await items.EditAsync(item.Id, new ItemEdit(item.Title, null, null, null, null, due, dueTime, start, end));

        if (complete)
        {
            await items.SetCompletedAsync(project.Id, null, item.Id, true);
        }

        return new SeededItem(project.Id, item.Id);
    }

    private static void ScrollWeekGridToEnd(Window window)
    {
        var scroll = window.GetVisualDescendants().OfType<ScrollViewer>().First(viewer => viewer.Name == "WeekScroll");
        scroll.ScrollToEnd();
        Dispatcher.UIThread.RunJobs();
        window.UpdateLayout();
    }

    private static Border MonthCell(Window window, DateOnly day)
    {
        return HeadlessInput.FindNamed<Border>(window, "CalendarDayCell", day.ToString("yyyy-MM-dd"));
    }

    private static Grid TimeColumn(Window window, DateOnly day)
    {
        return HeadlessInput.FindNamed<Grid>(window, "CalendarTimeColumn", day.ToString("yyyy-MM-dd"));
    }

    private static bool HasEntryOn(CalendarViewModel calendar, DateOnly day)
    {
        return calendar.Days.Single(candidate => candidate.Date == day).Entries.Count > 0;
    }

    private static DateOnly? FocusedEntryDay(Window window)
    {
        return FocusedEntry(window)?.Day;
    }

    private static TimeOnly? FocusedEntryStart(Window window)
    {
        return FocusedEntry(window)?.Start;
    }

    private static CalendarEntryViewModel? FocusedEntry(Window window)
    {
        var focused = window.FocusManager?.GetFocusedElement() as Button;
        return focused?.DataContext as CalendarEntryViewModel;
    }

    private sealed record SeededItem(Guid ProjectId, Guid ItemId)
    {
        public async Task<TodoItem> ReadAsync(IServiceProvider services)
        {
            var area = await services.GetRequiredService<ItemService>().LoadAreaAsync(ProjectId, null);
            return area.Items.Single(node => node.Item.Id == ItemId).Item;
        }
    }
}