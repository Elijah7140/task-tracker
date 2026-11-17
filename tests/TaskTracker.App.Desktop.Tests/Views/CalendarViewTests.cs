using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Media;
using Avalonia.Threading;
using Avalonia.VisualTree;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests.Views;

/// <summary>Calendar navigation, shortcuts and entry activation through simulated headless input.</summary>
public sealed class CalendarViewTests
{
    private const RawInputModifiers CtrlShift = RawInputModifiers.Control | RawInputModifiers.Shift;

    private static readonly DateOnly TheThirteenth = new(2026, 11, 13);

    [AvaloniaFact]
    public async Task Shortcut_opens_calendar_and_Escape_returns_home()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();

        HeadlessInput.Press(window, Key.C, CtrlShift);

        Assert.IsType<CalendarViewModel>(shell.CurrentPage);
        HeadlessInput.Press(window, Key.Escape);
        Assert.IsType<HomeViewModel>(shell.CurrentPage);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(RawInputModifiers.Control)]
    [InlineData(RawInputModifiers.Shift)]
    [InlineData(RawInputModifiers.None)]
    [InlineData(RawInputModifiers.Control | RawInputModifiers.Shift | RawInputModifiers.Alt)]
    public async Task Calendar_shortcut_ignores_extra_or_missing_modifiers(RawInputModifiers modifiers)
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();

        HeadlessInput.Press(window, Key.C, modifiers);

        Assert.IsType<HomeViewModel>(shell.CurrentPage);
        window.Close();
    }

    [AvaloniaFact]
    public async Task A_second_calendar_shortcut_does_not_open_a_second_calendar()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        HeadlessInput.Press(window, Key.C, CtrlShift);
        var calendar = shell.CurrentPage;

        HeadlessInput.Press(window, Key.C, CtrlShift);

        Assert.Same(calendar, shell.CurrentPage);
        HeadlessInput.Press(window, Key.Escape);
        Assert.IsType<HomeViewModel>(shell.CurrentPage);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Escape_from_week_view_returns_to_the_page_the_calendar_came_from()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project");
        var shell = ShowShell(window, services);
        await shell.OpenProjectAsync(project.Id);
        var workspace = shell.CurrentPage;
        HeadlessInput.Press(window, Key.C, CtrlShift);
        HeadlessInput.Press(window, Key.W, CtrlShift);
        Assert.True(Assert.IsType<CalendarViewModel>(shell.CurrentPage).IsWeek);

        HeadlessInput.Press(window, Key.Escape);

        Assert.Same(workspace, shell.CurrentPage);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(Key.PageDown, RawInputModifiers.Control)]
    [InlineData(Key.PageUp, RawInputModifiers.Shift)]
    [InlineData(Key.Escape, RawInputModifiers.Shift)]
    [InlineData(Key.Escape, RawInputModifiers.Control)]
    public async Task Calendar_keys_do_nothing_with_a_modifier_held(Key key, RawInputModifiers modifiers)
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        HeadlessInput.Press(window, Key.C, CtrlShift);
        var calendar = Assert.IsType<CalendarViewModel>(shell.CurrentPage);
        var title = calendar.Title;

        HeadlessInput.Press(window, key, modifiers);

        Assert.Same(calendar, shell.CurrentPage);
        Assert.Equal(title, calendar.Title);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Buttons_change_period_and_switch_to_week()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "HomeCalendarButton"));
        var calendar = Assert.IsType<CalendarViewModel>(shell.CurrentPage);
        var original = calendar.Title;

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "CalendarNextButton"));
        Assert.NotEqual(original, calendar.Title);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "CalendarPreviousButton"));
        Assert.Equal(original, calendar.Title);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "CalendarNextButton"));
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "CalendarTodayButton"));
        Assert.Equal(original, calendar.Title);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "CalendarWeekButton"));
        Assert.True(calendar.IsWeek);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Calendar_shortcuts_change_period_and_view()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        HeadlessInput.Press(window, Key.C, CtrlShift);
        var calendar = Assert.IsType<CalendarViewModel>(shell.CurrentPage);
        var original = calendar.Title;

        HeadlessInput.Press(window, Key.PageDown);
        Assert.NotEqual(original, calendar.Title);
        HeadlessInput.Press(window, Key.PageUp);
        Assert.Equal(original, calendar.Title);
        HeadlessInput.Press(window, Key.W, CtrlShift);
        Assert.True(calendar.IsWeek);
        HeadlessInput.Press(window, Key.M, CtrlShift);
        Assert.True(calendar.IsMonth);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Clicking_or_pressing_Enter_on_an_entry_opens_its_folder_with_the_item_selected()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedItemInFolderAsync(services);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        HeadlessInput.Press(window, Key.C, CtrlShift);
        var calendar = Assert.IsType<CalendarViewModel>(shell.CurrentPage);
        Dispatcher.UIThread.RunJobs();
        Assert.Single(calendar.Days.SelectMany(day => day.Entries));

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "CalendarEntryButton"));

        var clicked = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        Assert.Equal(seeded.FolderId, clicked.SelectedFolder?.Id);
        Assert.Equal(seeded.ItemId, clicked.Editor?.Id);
        HeadlessInput.Press(window, Key.C, CtrlShift);
        Assert.IsType<CalendarViewModel>(shell.CurrentPage);
        Dispatcher.UIThread.RunJobs();
        HeadlessInput.Find<Button>(window, "CalendarEntryButton").Focus();

        HeadlessInput.Press(window, Key.Enter);

        var entered = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        Assert.NotSame(clicked, entered);
        Assert.Equal(seeded.FolderId, entered.SelectedFolder?.Id);
        Assert.Equal(seeded.ItemId, entered.Editor?.Id);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Workspace_shortcut_starts_in_project_scope_and_Back_restores_workspace()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project");
        var shell = ShowShell(window, services);
        await shell.OpenProjectAsync(project.Id);
        var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);

        HeadlessInput.Press(window, Key.C, CtrlShift);
        var calendar = Assert.IsType<CalendarViewModel>(shell.CurrentPage);
        Assert.Equal("This project", calendar.SelectedScope);
        Dispatcher.UIThread.RunJobs();
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "CalendarBackButton"));

        Assert.Same(workspace, shell.CurrentPage);
        window.Close();
    }

    [AvaloniaFact]
    public async Task More_button_opens_the_clicked_day_in_week_view()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project");
        await CreateDueItemsAsync(services, project.Id, TheThirteenth, 4);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        HeadlessInput.Press(window, Key.C, CtrlShift);
        var calendar = Assert.IsType<CalendarViewModel>(shell.CurrentPage);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal("+1 more", HeadlessInput.Find<Button>(window, "CalendarMoreButton").Content);

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "CalendarMoreButton"));

        Assert.True(calendar.IsWeek);
        Assert.Equal(7, calendar.Days.Count);
        var clickedDay = Assert.Single(calendar.Days, day => day.Date == TheThirteenth);
        Assert.Equal(4, clickedDay.Entries.Count);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Week_all_day_row_shows_every_entry_inside_its_column()
    {
        var window = new MainWindow { Width = 800, Height = 600 };
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project");
        await CreateDueItemsAsync(services, project.Id, TheThirteenth, 4);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        HeadlessInput.Press(window, Key.C, CtrlShift);
        HeadlessInput.Press(window, Key.W, CtrlShift);
        Dispatcher.UIThread.RunJobs();
        window.UpdateLayout();

        var buttons = HeadlessInput.FindAll<Button>(window, "CalendarEntryButton");

        Assert.Equal(4, buttons.Count);
        var timeGridTop = TopOf(window, window.GetVisualDescendants().OfType<ScrollViewer>()
            .First(viewer => viewer.Name == "WeekScroll"));
        Assert.All(buttons, button => Assert.True(BottomOf(window, button) <= timeGridTop + 0.5));
        Assert.All(buttons, button => Assert.True(button.Bounds.Width <= ColumnOf(button).Bounds.Width + 0.5));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Overdue_entry_shows_its_label_and_a_coloured_background_in_month_and_week_views()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project");
        await CreateDueItemsAsync(services, project.Id, TheThirteenth.AddDays(-1), 1);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        HeadlessInput.Press(window, Key.C, CtrlShift);
        Dispatcher.UIThread.RunJobs();

        var monthButton = HeadlessInput.Find<Button>(window, "CalendarEntryButton");

        AssertShowsOverdue(monthButton);
        HeadlessInput.Press(window, Key.W, CtrlShift);
        Dispatcher.UIThread.RunJobs();
        var weekButton = HeadlessInput.Find<Button>(window, "CalendarEntryButton");
        AssertShowsOverdue(weekButton);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Activating_an_entry_whose_item_was_deleted_reloads_and_reports_it()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedItemInFolderAsync(services);
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        HeadlessInput.Press(window, Key.C, CtrlShift);
        Dispatcher.UIThread.RunJobs();
        await services.GetRequiredService<ItemService>().DeleteAsync(seeded.ProjectId, seeded.FolderId, seeded.ItemId);

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "CalendarEntryButton"));
        await WaitUntilAsync(() => HeadlessInput.FindAll<Button>(window, "CalendarEntryButton").Count == 0);

        Assert.IsType<CalendarViewModel>(shell.CurrentPage);
        Assert.Equal("This item no longer exists", HeadlessInput.Find<TextBlock>(window, "CalendarErrorText").Text);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData("DraftSaveButton", "Review invoice edited")]
    [InlineData("DraftDiscardButton", "Review invoice")]
    public async Task Entry_activation_resolves_one_unsaved_changes_prompt(string decisionButtonId, string expectedTitle)
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedDirtyWorkspaceAsync(window, services);
        var shell = seeded.Shell;
        HeadlessInput.Press(window, Key.C, CtrlShift);
        Dispatcher.UIThread.RunJobs();

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "CalendarEntryButton"));
        var prompt = Assert.Single(window.OwnedWindows);
        Assert.Equal("Unsaved changes", prompt.Title);
        HeadlessInput.Click(prompt, HeadlessInput.Find<Button>(prompt, decisionButtonId));
        await WaitUntilAsync(() => shell.CurrentPage is ProjectWorkspaceViewModel);

        Assert.Empty(window.OwnedWindows);
        var opened = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        Assert.Equal(expectedTitle, opened.Editor?.Title);
        var stored = await services.GetRequiredService<ItemService>().LoadAreaAsync(seeded.ProjectId, null);
        Assert.Equal(expectedTitle, Assert.Single(stored.Items).Item.Title);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Cancelling_the_unsaved_changes_prompt_keeps_the_calendar_and_the_draft()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedDirtyWorkspaceAsync(window, services);
        var shell = seeded.Shell;
        HeadlessInput.Press(window, Key.C, CtrlShift);
        var calendar = Assert.IsType<CalendarViewModel>(shell.CurrentPage);
        Dispatcher.UIThread.RunJobs();

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "CalendarEntryButton"));
        var prompt = Assert.Single(window.OwnedWindows);
        HeadlessInput.Press(prompt, Key.Escape);
        await WaitUntilAsync(() => window.OwnedWindows.Count == 0);

        Assert.Same(calendar, shell.CurrentPage);
        HeadlessInput.Press(window, Key.Escape);
        Assert.Same(seeded.Workspace, shell.CurrentPage);
        Assert.Equal("Review invoice edited", seeded.Workspace.Editor?.Title);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Draft_survives_Search_then_Calendar_and_is_asked_about_once_when_an_entry_opens()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var seeded = await SeedDirtyWorkspaceAsync(window, services);
        var shell = seeded.Shell;
        HeadlessInput.Press(window, Key.F, RawInputModifiers.Control);
        HeadlessInput.Press(window, Key.C, CtrlShift);
        Assert.IsType<CalendarViewModel>(shell.CurrentPage);
        Dispatcher.UIThread.RunJobs();

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "CalendarEntryButton"));

        var prompt = Assert.Single(window.OwnedWindows);
        Assert.Equal("Unsaved changes", prompt.Title);
        HeadlessInput.Press(prompt, Key.Escape);
        await WaitUntilAsync(() => window.OwnedWindows.Count == 0);
        Assert.IsType<CalendarViewModel>(shell.CurrentPage);
        Assert.Equal("Review invoice edited", seeded.Workspace.Editor?.Title);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task PageDown_and_PageUp_change_the_period_while_an_entry_has_focus(bool week)
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        await SeedTimedItemAsync(services, "Focused entry", TheThirteenth, new TimeOnly(10, 0));
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        HeadlessInput.Press(window, Key.C, CtrlShift);
        var calendar = Assert.IsType<CalendarViewModel>(shell.CurrentPage);
        HeadlessInput.Press(window, week ? Key.W : Key.M, CtrlShift);
        await WaitUntilAsync(() => calendar.Days.Count == (week ? 7 : 42));
        window.UpdateLayout();
        HeadlessInput.Find<Button>(window, "CalendarEntryButton").Focus();
        var original = calendar.Title;

        HeadlessInput.Press(window, Key.PageDown);

        Assert.NotEqual(original, calendar.Title);
        HeadlessInput.Press(window, Key.PageUp);
        Assert.Equal(original, calendar.Title);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Adjacent_half_hour_blocks_each_fill_the_column_at_their_real_height()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        var day = new DateTime(2026, 11, 13);
        await SeedScheduleAsync(services, "First half", day.AddHours(9), day.AddHours(9.5));
        await SeedScheduleAsync(services, "Second half", day.AddHours(9.5), day.AddHours(10));
        await SeedScheduleAsync(services, "No end", day.AddHours(11), null);
        await OpenWeekAsync(window, services);

        var first = HeadlessInput.FindNamed<Button>(window, "CalendarEntryButton", "First half");
        var second = HeadlessInput.FindNamed<Button>(window, "CalendarEntryButton", "Second half");
        var noEnd = HeadlessInput.FindNamed<Button>(window, "CalendarEntryButton", "No end");

        var halfHour = CalendarMetrics.HourHeight / 2;
        Assert.Equal(halfHour, first.Bounds.Height, 1);
        Assert.Equal(halfHour, second.Bounds.Height, 1);
        Assert.Equal(halfHour, noEnd.Bounds.Height, 1);
        Assert.Equal(ColumnOf(first).Bounds.Width, first.Bounds.Width, 1);
        Assert.Equal(first.Bounds.Width, second.Bounds.Width, 1);
        Assert.Equal(TopOf(window, first) + halfHour, TopOf(window, second), 1);
        window.Close();
    }

    [AvaloniaFact]
    public async Task A_marker_at_23_59_stays_fully_inside_the_day_column_and_keeps_its_text()
    {
        var window = new MainWindow { Width = 1200, Height = 900 };
        using var services = await TestServices.CreateAsync(window);
        await SeedTimedItemAsync(services, "Midnight deadline", TheThirteenth, new TimeOnly(23, 59));
        await OpenWeekAsync(window, services);
        var scroll = window.GetVisualDescendants().OfType<ScrollViewer>().First(viewer => viewer.Name == "WeekScroll");
        scroll.ScrollToEnd();
        Dispatcher.UIThread.RunJobs();
        window.UpdateLayout();

        var marker = HeadlessInput.FindNamed<Button>(window, "CalendarEntryButton", "Midnight deadline");

        var column = ColumnOf(marker);
        Assert.True(TopOf(window, marker) >= TopOf(window, column) - 0.5);
        Assert.True(BottomOf(window, marker) <= BottomOf(window, column) + 0.5);
        Assert.Equal(CalendarEntryViewModelHeight(marker), marker.Bounds.Height, 1);
        var title = marker.GetVisualDescendants().OfType<TextBlock>()
            .First(text => text.IsEffectivelyVisible && text.Text == "Midnight deadline");
        Assert.True(BottomOf(window, title) <= BottomOf(window, column) + 0.5);
        window.Close();
    }

    private static double CalendarEntryViewModelHeight(Button button)
    {
        return ((CalendarEntryViewModel)button.DataContext!).Height;
    }

    private static async Task OpenWeekAsync(MainWindow window, IServiceProvider services)
    {
        var shell = ShowShell(window, services);
        await shell.GoHomeAsync();
        HeadlessInput.Press(window, Key.C, CtrlShift);
        var calendar = Assert.IsType<CalendarViewModel>(shell.CurrentPage);
        HeadlessInput.Press(window, Key.W, CtrlShift);
        await WaitUntilAsync(() => calendar.Days.Count == 7);
        window.UpdateLayout();
        Dispatcher.UIThread.RunJobs();
    }

    private static async Task SeedTimedItemAsync(IServiceProvider services, string title, DateOnly due, TimeOnly time)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project " + title);
        var items = services.GetRequiredService<ItemService>();
        var item = await items.CreateAsync(project.Id, null, null, title);
        await items.EditAsync(item.Id, new ItemEdit(title, null, null, null, null, due, time, null, null));
    }

    private static async Task SeedScheduleAsync(IServiceProvider services, string title, DateTime start, DateTime? end)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project " + title);
        var items = services.GetRequiredService<ItemService>();
        var item = await items.CreateAsync(project.Id, null, null, title);
        await items.EditAsync(item.Id, new ItemEdit(title, null, null, null, null, null, null, start, end));
    }

    private static void AssertShowsOverdue(Button entryButton)
    {
        var labels = entryButton.GetVisualDescendants().OfType<TextBlock>()
            .Where(text => text.IsEffectivelyVisible)
            .ToList();
        Assert.Contains(labels, text => text.Text == "Overdue");
        var title = Assert.Single(labels, text => text.Text?.Contains("Due item") == true);
        Assert.Equal(FontWeight.Bold, title.FontWeight);
        var background = Assert.IsAssignableFrom<ISolidColorBrush>(entryButton.Background);
        Assert.NotEqual(Colors.Transparent, background.Color);
    }

    private static MainWindowViewModel ShowShell(MainWindow window, IServiceProvider services)
    {
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;
        window.Show();
        return shell;
    }

    private static async Task<SeededItem> SeedItemInFolderAsync(IServiceProvider services)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project");
        var folder = await services.GetRequiredService<FolderService>().CreateAsync(project.Id, null, "dbo");
        var items = services.GetRequiredService<ItemService>();
        var item = await items.CreateAsync(project.Id, folder.Id, null, "Due today");
        await items.EditAsync(item.Id, new ItemEdit(item.Title, null, null, null, null,
            TheThirteenth, null, null, null));
        return new SeededItem(project.Id, folder.Id, item.Id);
    }

    private static async Task CreateDueItemsAsync(IServiceProvider services, Guid projectId, DateOnly due, int count)
    {
        var items = services.GetRequiredService<ItemService>();

        for (var index = 0; index < count; index++)
        {
            var item = await items.CreateAsync(projectId, null, null, $"Due item {index}");
            await items.EditAsync(item.Id, new ItemEdit(item.Title, null, null, null, null,
                due, null, null, null));
        }
    }

    /// <summary>A workspace showing an item due today whose title was edited and not saved.</summary>
    private static async Task<DirtyWorkspace> SeedDirtyWorkspaceAsync(MainWindow window, IServiceProvider services)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var items = services.GetRequiredService<ItemService>();
        var item = await items.CreateAsync(project.Id, null, null, "Review invoice");
        await items.EditAsync(item.Id, new ItemEdit(item.Title, null, null, null, null,
            TheThirteenth, null, null, null));
        var shell = ShowShell(window, services);
        await shell.OpenProjectAsync(project.Id);
        var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        await workspace.SelectItemAsync(Assert.Single(workspace.OpenItems));
        Dispatcher.UIThread.RunJobs();
        HeadlessInput.TypeInto(window, HeadlessInput.Find<TextBox>(window, "EditorTitleBox"), " edited");
        return new DirtyWorkspace(shell, workspace, project.Id);
    }

    private static Control ColumnOf(Control entryButton)
    {
        return entryButton.GetVisualAncestors().OfType<Control>().First(IsDayColumn);
    }

    private static bool IsDayColumn(Control control)
    {
        var isAllDayColumn = control is StackPanel panel && panel.MinWidth == 90;
        var isTimeColumn = control is Grid grid && grid.Classes.Contains("timeColumn");
        return isAllDayColumn || isTimeColumn;
    }

    private static double TopOf(Visual window, Visual control)
    {
        return control.TranslatePoint(default, window)!.Value.Y;
    }

    private static double BottomOf(Visual window, Control control)
    {
        return TopOf(window, control) + control.Bounds.Height;
    }

    private static async Task WaitUntilAsync(Func<bool> condition)
    {
        for (var attempt = 0; attempt < 300 && !condition(); attempt++)
        {
            await Task.Delay(10);
            Dispatcher.UIThread.RunJobs();
        }

        Assert.True(condition(), "The condition was not met in time.");
    }

    private sealed record SeededItem(Guid ProjectId, Guid FolderId, Guid ItemId);

    private sealed record DirtyWorkspace(MainWindowViewModel Shell, ProjectWorkspaceViewModel Workspace, Guid ProjectId);
}