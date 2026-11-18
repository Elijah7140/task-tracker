using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Styling;
using Avalonia.Threading;
using Avalonia.VisualTree;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Search;
using TaskTracker.Core.Trash;
using TaskTracker.Presentation.Installation;
using TaskTracker.Presentation.Navigation;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>Approved images of the principal application screens.</summary>
public sealed class ScreenSnapshotTests
{
    [AvaloniaTheory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    [InlineData(true, true)]
    public async Task Item_drop_indicator_matches_approved_image(bool dark, bool into)
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project");
        var items = services.GetRequiredService<ItemService>();
        var first = await items.CreateAsync(project.Id, null, null, "First item");
        var second = await items.CreateAsync(project.Id, null, null, "Second item");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark);
        await shell.OpenProjectAsync(project.Id);
        Dispatcher.UIThread.RunJobs();
        var rows = window.GetVisualDescendants().OfType<Border>()
            .Where(border => (border.Classes.Contains("itemRow") || border.Classes.Contains("itemCard"))).ToArray();
        var firstRow = rows.Single(border => (border.DataContext as ItemRowViewModel)?.Id == first.Id);
        var secondRow = rows.Single(border => (border.DataContext as ItemRowViewModel)?.Id == second.Id);
        var start = HeadlessInput.CentreOf(window, secondRow);
        var finish = HeadlessInput.PointIn(window, firstRow,
            into ? firstRow.Bounds.Width / 2 : firstRow.Bounds.Width * 0.2, firstRow.Bounds.Height / 2);

        HeadlessInput.PressMouse(window, start);
        HeadlessInput.MoveMouse(window, finish);
        Assert.Contains(into ? "dropInto" : "dropBefore", firstRow.Classes);
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        var kind = into ? "into" : "before";
        SnapshotComparer.AssertMatches(frame, $"item-drop-{kind}-{ThemeName(dark)}");
        HeadlessInput.ReleaseMouse(window, finish);
        window.Close();
    }
    /// <summary>Tall enough to show a whole settings page or the whole item editor without scrolling.</summary>
    private const int TallWindowHeight = 1500;

    /// <summary>App Settings also has the About card, so the expanded choice editor needs more room.</summary>
    private const int AppSettingsWindowHeight = 1700;

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Calendar_month_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        await SeedCalendarAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark);
        await shell.GoHomeAsync();
        await shell.OpenCalendarAsync();
        var page = Assert.IsType<CalendarViewModel>(shell.CurrentPage);
        page.IncludeCompleted = true;
        await page.LoadAsync();
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"calendar-month-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Calendar_week_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        await SeedCalendarAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark);
        await shell.GoHomeAsync();
        await shell.OpenCalendarAsync();
        var page = Assert.IsType<CalendarViewModel>(shell.CurrentPage);
        page.IncludeCompleted = true;
        await page.SetWeekAsync(true);
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"calendar-week-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Calendar_month_at_minimum_size_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        await SeedCalendarAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark, 600, 800);
        await shell.GoHomeAsync();
        await shell.OpenCalendarAsync();
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"calendar-narrow-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Calendar_week_with_adjacent_half_hour_blocks_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        await SeedShortBlocksAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark);
        await shell.GoHomeAsync();
        await shell.OpenCalendarAsync();
        var page = Assert.IsType<CalendarViewModel>(shell.CurrentPage);
        await page.SetWeekAsync(true);
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"calendar-week-short-blocks-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Calendar_week_late_at_night_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        await SeedLateNightAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark);
        await shell.GoHomeAsync();
        await shell.OpenCalendarAsync();
        var page = Assert.IsType<CalendarViewModel>(shell.CurrentPage);
        await page.SetWeekAsync(true);
        ScrollWeekGridToEnd(window);
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"calendar-week-late-night-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Calendar_week_at_minimum_size_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        await SeedCalendarAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark, 600, 800);
        await shell.GoHomeAsync();
        await shell.OpenCalendarAsync();
        var page = Assert.IsType<CalendarViewModel>(shell.CurrentPage);
        page.IncludeCompleted = true;
        await page.SetWeekAsync(true);
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"calendar-week-narrow-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Calendar_week_mid_drag_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        await SeedCalendarAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark);
        await shell.GoHomeAsync();
        await shell.OpenCalendarAsync();
        var page = Assert.IsType<CalendarViewModel>(shell.CurrentPage);
        await page.SetWeekAsync(true);
        window.UpdateLayout();
        Dispatcher.UIThread.RunJobs();
        var block = HeadlessInput.FindNamed<Button>(window, "CalendarEntryButton", "Discuss rollout");
        var column = HeadlessInput.FindNamed<Grid>(window, "CalendarTimeColumn", "2026-11-14");
        var grabOffset = 12.0;
        var dropY = CalendarMetrics.OffsetOf(new TimeOnly(11, 30)) + grabOffset;

        HeadlessInput.PressMouse(window, HeadlessInput.PointIn(window, block, block.Bounds.Width / 2, grabOffset));
        HeadlessInput.MoveMouse(window, HeadlessInput.PointIn(window, column, column.Bounds.Width / 2, dropY));
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"calendar-week-drag-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Calendar_month_mid_drag_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        await SeedCalendarAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark);
        await shell.GoHomeAsync();
        await shell.OpenCalendarAsync();
        window.UpdateLayout();
        Dispatcher.UIThread.RunJobs();
        var entry = HeadlessInput.FindNamed<Button>(window, "CalendarEntryButton", "Review invoice index");
        var targetCell = HeadlessInput.FindNamed<Border>(window, "CalendarDayCell", "2026-11-17");

        HeadlessInput.PressMouse(window, HeadlessInput.CentreOf(window, entry));
        HeadlessInput.MoveMouse(window, HeadlessInput.CentreOf(window, targetCell));
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"calendar-month-drag-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Calendar_week_all_day_drop_outline_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        await SeedCalendarAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark);
        await shell.GoHomeAsync();
        await shell.OpenCalendarAsync();
        var page = Assert.IsType<CalendarViewModel>(shell.CurrentPage);
        await page.SetWeekAsync(true);
        window.UpdateLayout();
        Dispatcher.UIThread.RunJobs();
        var entry = HeadlessInput.FindNamed<Button>(window, "CalendarEntryButton", "Archive logs");
        var cell = HeadlessInput.FindNamed<Border>(window, "CalendarAllDayCell", "2026-11-14");

        HeadlessInput.PressMouse(window, HeadlessInput.CentreOf(window, entry));
        HeadlessInput.MoveMouse(window, HeadlessInput.CentreOf(window, cell));
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"calendar-week-allday-drag-{ThemeName(dark)}");
        window.Close();
    }

    /// <summary>
    /// Two schedules that touch at 09:30, a 15-minute block, a schedule without an end and a due marker
    /// after it: every one is drawn as tall as its duration.
    /// </summary>
    private static async Task SeedShortBlocksAsync(IServiceProvider services)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing DB");
        var items = services.GetRequiredService<ItemService>();
        var day = new DateTime(2026, 11, 13);
        await ScheduleAsync(items, project.Id, "Standup", day.AddHours(9), day.AddHours(9.5));
        await ScheduleAsync(items, project.Id, "Review", day.AddHours(9.5), day.AddHours(10));
        await ScheduleAsync(items, project.Id, "Quick sync", day.AddHours(10.25), day.AddHours(10.5));
        await ScheduleAsync(items, project.Id, "Open ended", day.AddHours(11), null);
        await DueAtAsync(items, project.Id, "Send agenda", DateOnly.FromDateTime(day), new TimeOnly(12, 0));
    }

    /// <summary>A due marker at 23:59 and a block that runs to midnight, both at the very end of the grid.</summary>
    private static async Task SeedLateNightAsync(IServiceProvider services)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing DB");
        var items = services.GetRequiredService<ItemService>();
        var day = new DateTime(2026, 11, 13);
        await DueAtAsync(items, project.Id, "Midnight deadline", DateOnly.FromDateTime(day), new TimeOnly(23, 59));
        await DueAtAsync(items, project.Id, "Late report", DateOnly.FromDateTime(day).AddDays(1), new TimeOnly(23, 45));
        await ScheduleAsync(items, project.Id, "Night deploy", day.AddHours(22), day.AddHours(23.5));
    }

    private static async Task ScheduleAsync(ItemService items, Guid projectId, string title, DateTime start, DateTime? end)
    {
        var item = await items.CreateAsync(projectId, null, null, title);
        await items.EditAsync(item.Id, new ItemEdit(title, null, null, null, null, null, null, start, end));
    }

    private static async Task DueAtAsync(ItemService items, Guid projectId, string title, DateOnly due, TimeOnly time)
    {
        var item = await items.CreateAsync(projectId, null, null, title);
        await items.EditAsync(item.Id, new ItemEdit(title, null, null, null, null, due, time, null, null));
    }

    private static void ScrollWeekGridToEnd(Window window)
    {
        Dispatcher.UIThread.RunJobs();
        window.UpdateLayout();
        var scroll = window.GetVisualDescendants().OfType<ScrollViewer>().First(viewer => viewer.Name == "WeekScroll");
        scroll.ScrollToEnd();
        Dispatcher.UIThread.RunJobs();
        window.UpdateLayout();
    }

    private static async Task SeedCalendarAsync(IServiceProvider services)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing DB");
        var items = services.GetRequiredService<ItemService>();
        var today = new DateOnly(2026, 11, 13);
        var first = await items.CreateAsync(project.Id, null, null, "Review invoice index");
        var second = await items.CreateAsync(project.Id, null, null, "Discuss rollout");
        var third = await items.CreateAsync(project.Id, null, null, "Send notes");
        var fourth = await items.CreateAsync(project.Id, null, null, "Overdue migration");
        var finished = await items.CreateAsync(project.Id, null, null, "Finished review");
        await items.EditAsync(first.Id, new ItemEdit(first.Title, null, null, null, null,
            today, null, new DateTime(2026, 11, 13, 9, 0, 0), new DateTime(2026, 11, 13, 11, 0, 0)));
        await items.EditAsync(second.Id, new ItemEdit(second.Title, null, null, null, null,
            null, null, new DateTime(2026, 11, 13, 9, 30, 0), new DateTime(2026, 11, 13, 10, 30, 0)));
        await items.EditAsync(third.Id, new ItemEdit(third.Title, null, null, null, null,
            today, new TimeOnly(14, 0), null, null));
        await items.EditAsync(fourth.Id, new ItemEdit(fourth.Title, null, null, null, null,
            today.AddDays(-1), null, null, null));
        await items.EditAsync(finished.Id, new ItemEdit(finished.Title, null, null, null, null,
            today, null, null, null));
        await items.SetCompletedAsync(project.Id, null, finished.Id, true);
        await SeedBusyDayAsync(items, project.Id, today);
    }

    /// <summary>
    /// Adds a workshop block that a timed due entry overlaps, two more all-day entries so one day
    /// has more than three, and an entry that is only approaching its deadline.
    /// </summary>
    private static async Task SeedBusyDayAsync(ItemService items, Guid projectId, DateOnly today)
    {
        var workshop = await items.CreateAsync(projectId, null, null, "Team workshop");
        var archive = await items.CreateAsync(projectId, null, null, "Archive logs");
        var docs = await items.CreateAsync(projectId, null, null, "Update docs");
        var retro = await items.CreateAsync(projectId, null, null, "Plan retro");
        await items.EditAsync(workshop.Id, new ItemEdit(workshop.Title, null, null, null, null,
            null, null, new DateTime(2026, 11, 13, 14, 0, 0), new DateTime(2026, 11, 13, 16, 0, 0)));
        await items.EditAsync(archive.Id, new ItemEdit(archive.Title, null, null, null, null,
            today, null, null, null));
        await items.EditAsync(docs.Id, new ItemEdit(docs.Title, null, null, null, null,
            today, null, null, null));
        await items.EditAsync(retro.Id, new ItemEdit(retro.Title, null, null, null, null,
            today.AddDays(1), null, null, null));
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Search_with_filters_and_results_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        await SeedSearchableItemsAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark);
        await shell.GoHomeAsync();
        await shell.OpenSearchAsync();
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        page.Text = "Review";
        page.IncludeCompleted = true;
        AddDueBetweenFilter(page, new DateOnly(2026, 11, 15), new DateOnly(2026, 12, 15));
        AddTitleContainsFilter(page, "invoice");
        await page.RunAsync();
        Assert.Equal(4, page.Results.Count);
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"search-results-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Search_at_minimum_window_size_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        await SeedSearchableItemsAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark, 600, 800);
        await shell.GoHomeAsync();
        await shell.OpenSearchAsync();
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        page.Text = "Review";
        page.IncludeCompleted = true;
        AddDueBetweenFilter(page, new DateOnly(2026, 11, 15), new DateOnly(2026, 12, 15));
        await page.RunAsync();
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"search-narrow-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Search_with_an_invalid_range_and_an_invalid_number_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing DB");
        var effort = await services.GetRequiredService<FieldService>()
            .CreateAsync("Effort", FieldDataType.Number, project.Id);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark);
        await shell.OpenProjectAsync(project.Id);
        await shell.OpenSearchAsync();
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        var range = AddNumberFilter(page, effort.Key, FilterOperator.Between);
        range.FirstText = "5";
        range.SecondText = "1";
        var invalid = AddNumberFilter(page, effort.Key, FilterOperator.Equals);
        invalid.FirstText = "twelve";
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(range.ValueError);
        Assert.NotNull(invalid.ValueError);
        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"search-error-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Search_empty_state_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark);
        await shell.GoHomeAsync();
        await shell.OpenSearchAsync();
        var page = Assert.IsType<SearchViewModel>(shell.CurrentPage);
        page.Text = "missing";
        await page.RunAsync();
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"search-empty-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Home_with_projects_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        var projects = services.GetRequiredService<ProjectService>();
        await projects.CreateAsync("Billing DB");
        await projects.CreateAsync("Website refresh");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        shell.ShowsTitleBar = true;
        var window = OpenWindow(shell, dark);

        await shell.GoHomeAsync();
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"home-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Workspace_with_items_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        var (projectId, parentId) = await SeedWorkspaceAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark, TallWindowHeight);

        await shell.OpenProjectAsync(projectId);
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        var parentRow = page.OpenItems.Single(row => row.Id == parentId);
        parentRow.IsExpanded = true;
        await page.SelectItemAsync(parentRow);
        page.IsCompletedExpanded = true;
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"workspace-{ThemeName(dark)}");
        window.Close();
    }

    /// <summary>The card grid at the owner's 1440p target: four cards across, about two rows tall (§7.17).</summary>
    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Workspace_card_grid_at_1440p_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        var projectId = await SeedCardGridAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark, height: 1440, width: 2560);

        await shell.OpenProjectAsync(projectId);
        Dispatcher.UIThread.RunJobs();
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        var grid = window.GetVisualDescendants().OfType<CardGridPanel>().First();
        Assert.Equal(4, grid.ColumnsFor(grid.Bounds.Width));
        SnapshotComparer.AssertMatches(frame, $"workspace-card-grid-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Workspace_undo_status_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project");
        var items = services.GetRequiredService<ItemService>();
        await items.CreateAsync(project.Id, null, null, "Task");
        await items.CreateAsync(project.Id, null, null, "Second task");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark);

        await shell.OpenProjectAsync(project.Id);
        await shell.Undo!.UndoAsync();
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"workspace-undo-status-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task App_settings_match_approved_image(bool dark)
    {
        var updates = new FakeUpdateService { CheckResult = UpdateCheckResult.Available("0.2.0") };
        var startup = new FakeStartupRegistration { IsAvailable = true };
        using var services = await TestServices.CreateAsync(installation: TestServices.CreateInstallation(updates, startup));
        await SeedGlobalFieldsAsync(services);
        var lookups = services.GetRequiredService<TaskTracker.Core.Lookups.LookupService>();
        await lookups.SetPriorityNumberAsync(TaskTracker.Core.Lookups.BuiltInLookups.CriticalId, 1);
        await lookups.SetPriorityNumberAsync(TaskTracker.Core.Lookups.BuiltInLookups.HighId, 7);
        await lookups.SetPriorityNumberAsync(TaskTracker.Core.Lookups.BuiltInLookups.MediumId, 2);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark, AppSettingsWindowHeight);

        await shell.OpenAppSettingsAsync();
        var page = Assert.IsType<AppSettingsViewModel>(shell.CurrentPage);
        await page.Updates!.CheckCommand.ExecuteAsync(null);
        await page.Updates.DownloadCommand.ExecuteAsync(null);
        page.CustomFields!.Rows.Single(row => row.Name == "Status").Choices!.IsExpanded = true;
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"app-settings-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Project_settings_match_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing DB");
        await SeedGlobalFieldsAsync(services);
        await SeedProjectFieldsAsync(services, project.Id);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark, TallWindowHeight);

        await shell.OpenProjectSettingsAsync(project.Id);
        var page = Assert.IsType<ProjectSettingsViewModel>(shell.CurrentPage);
        page.CustomFields!.Rows.Single(row => row.Name == "Risk level").Choices!.IsExpanded = true;
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"project-settings-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Workspace_with_an_invalid_custom_number_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        var (projectId, parentId) = await SeedWorkspaceAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark, TallWindowHeight);
        await shell.OpenProjectAsync(projectId);
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        var parentRow = page.OpenItems.Single(row => row.Id == parentId);
        parentRow.IsExpanded = true;
        await page.SelectItemAsync(parentRow);
        page.IsCompletedExpanded = true;

        page.Editor!.CustomFields.OfType<NumberFieldInputViewModel>().Single().Text = "twelve";
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"workspace-invalid-number-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Field_manager_with_archived_items_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        await SeedFieldsWithArchivedItemsAsync(services);
        var manager = new FieldManagerViewModel(services.GetRequiredService<FieldService>(),
            services.GetRequiredService<IDialogService>(), null);
        await manager.LoadAsync();
        await manager.SetShowArchivedCommand.ExecuteAsync(true);
        manager.Rows.Single(row => row.Name == "Status").Choices!.IsExpanded = true;
        Application.Current!.RequestedThemeVariant = dark ? ThemeVariant.Dark : ThemeVariant.Light;
        var window = new Window { Content = new FieldManagerView { DataContext = manager }, Width = 900, Height = 640 };

        window.Show();
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"field-manager-archived-{ThemeName(dark)}");
        window.Close();
    }

    private static async Task<(Guid ProjectId, Guid ParentId)> SeedWorkspaceAsync(IServiceProvider services)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing DB");
        var folders = services.GetRequiredService<FolderService>();
        var schema = await folders.CreateAsync(project.Id, null, "dbo");
        await folders.CreateAsync(project.Id, schema.Id, "Tables");
        var items = services.GetRequiredService<ItemService>();
        var parent = await items.CreateAsync(project.Id, null, null, "Review invoice indexes");
        var child = await items.CreateAsync(project.Id, null, parent.Id, "Check query plan");
        var immediate = await items.CreateAsync(project.Id, null, null, "Review migration");
        var approaching = await items.CreateAsync(project.Id, null, null, "Prepare release notes");
        var finished = await items.CreateAsync(project.Id, null, null, "Schema review complete");
        var lookups = services.GetRequiredService<LookupService>();
        var change = (await lookups.ItemTypesAsync()).Single(type => type.Name == "Change");
        var high = (await lookups.PriorityLevelsAsync()).Single(level => level.Name == "High");
        // The selected item fills every date and time field, built-in and custom, so this image shows
        // filled pickers; the editor snapshots of other items cover the empty "hour minute --" state.
        var customFields = await CreateCustomFieldsAsync(services);
        await items.EditAsync(parent.Id, new ItemEdit(parent.Title, null, null, null, null,
            new DateOnly(2026, 11, 20), new TimeOnly(9, 30),
            new DateTime(2026, 11, 16, 9, 0, 0), new DateTime(2026, 11, 16, 11, 0, 0)),
            customFields.Values);
        await services.GetRequiredService<FieldService>().ArchiveAsync(customFields.ArchivedFieldId);
        await items.EditAsync(child.Id, new ItemEdit(child.Title, null, "DB-120", change.Id,
            high.Id, new DateOnly(2026, 11, 12), null, null, null));
        await items.EditAsync(immediate.Id, new ItemEdit(immediate.Title, null, "DB-121", change.Id,
            high.Id, new DateOnly(2026, 11, 13), null, null, null));
        await items.EditAsync(approaching.Id, new ItemEdit(approaching.Title, null, null, null,
            null, new DateOnly(2026, 11, 15), null, null, null));
        await items.SetCompletedAsync(project.Id, null, finished.Id, true);
        return (project.Id, parent.Id);
    }

    /// <summary>
    /// Seeds a "No priority" section with two cards, a full "High" section of five cards (so it
    /// wraps), and one "Low" card. Cards carry descriptions, tickets, dates and sub-items of
    /// different lengths, so rows show the tallest-card rule.
    /// </summary>
    private static async Task<Guid> SeedCardGridAsync(IServiceProvider services)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing DB");
        var items = services.GetRequiredService<ItemService>();
        await AddCardAsync(items, project.Id, "Draft the Q1 roadmap", null, "Collect the requests from the owner review.", 0);
        await AddCardAsync(items, project.Id, "Tidy the test fixtures", null, null, 2);
        await AddCardAsync(items, project.Id, "Add index to Invoice.CustomerId", BuiltInLookups.HighId,
            "Slow invoice lookups on the customer page. Check the plan before and after.", 3);
        await AddCardAsync(items, project.Id, "Review migration", BuiltInLookups.HighId, null, 0);
        await AddCardAsync(items, project.Id, "Fix rounding in tax totals", BuiltInLookups.HighId,
            "Totals are off by a cent when a discount applies.", 1);
        await AddCardAsync(items, project.Id, "Prepare release notes", BuiltInLookups.HighId, null, 6);
        await AddCardAsync(items, project.Id, "Archive old audit rows", BuiltInLookups.HighId, null, 0);
        await AddCardAsync(items, project.Id, "Rename the reporting schema", BuiltInLookups.LowId, null, 1);
        return project.Id;
    }

    private static async Task AddCardAsync(ItemService items, Guid projectId, string title, Guid? priorityId,
        string? description, int subItems)
    {
        var card = await items.CreateAsync(projectId, null, null, title);
        var ticket = priorityId is null ? null : $"DB-{130 + title.Length}";
        await items.EditAsync(card.Id, new ItemEdit(title, description, ticket, null, priorityId,
            new DateOnly(2026, 11, 25), null, null, null));

        for (var number = 1; number <= subItems; number++)
        {
            await items.CreateAsync(projectId, null, card.Id, $"Step {number}");
        }
    }

    /// <summary>
    /// Creates one global field of each type plus one that the caller archives once its value is stored,
    /// and returns a value for each.
    /// </summary>
    private static async Task<CustomFieldSeed> CreateCustomFieldsAsync(IServiceProvider services)
    {
        var fields = services.GetRequiredService<FieldService>();
        var summary = await fields.CreateAsync("Summary", FieldDataType.Text, null);
        var effort = await fields.CreateAsync("Effort", FieldDataType.Number, null);
        var review = await fields.CreateAsync("Review date", FieldDataType.Date, null);
        var approved = await fields.CreateAsync("Approved", FieldDataType.Boolean, null);
        var status = await fields.CreateAsync("Status", FieldDataType.Choice, null);
        var ready = await fields.AddChoiceAsync(status.Id, "Ready");
        var legacy = await fields.CreateAsync("Legacy reference", FieldDataType.Text, null);
        var values = new FieldValueInput[]
        {
            new(summary.Id, TextValue: "Check query cost"),
            new(effort.Id, NumberValue: 3.5),
            new(review.Id, DateValue: new DateOnly(2026, 11, 19)),
            new(approved.Id, BoolValue: true),
            new(status.Id, ChoiceId: ready.Id),
            new(legacy.Id, TextValue: "INV-2041")
        };

        return new CustomFieldSeed(values, legacy.Id);
    }

    private sealed record CustomFieldSeed(FieldValueInput[] Values, Guid ArchivedFieldId);

    private static async Task SeedGlobalFieldsAsync(IServiceProvider services)
    {
        var fields = services.GetRequiredService<FieldService>();
        await fields.CreateAsync("Summary", FieldDataType.Text, null);
        await fields.CreateAsync("Effort", FieldDataType.Number, null);
        await fields.CreateAsync("Review date", FieldDataType.Date, null);
        await fields.CreateAsync("Approved", FieldDataType.Boolean, null);
        var status = await fields.CreateAsync("Status", FieldDataType.Choice, null);
        await fields.AddChoiceAsync(status.Id, "Ready");
        await fields.AddChoiceAsync(status.Id, "Blocked");
    }

    /// <summary>One archived field, and a choice field that has an archived choice.</summary>
    private static async Task SeedFieldsWithArchivedItemsAsync(IServiceProvider services)
    {
        var fields = services.GetRequiredService<FieldService>();
        await fields.CreateAsync("Summary", FieldDataType.Text, null);
        await fields.CreateAsync("Effort", FieldDataType.Number, null);
        var legacy = await fields.CreateAsync("Legacy reference", FieldDataType.Text, null);
        var status = await fields.CreateAsync("Status", FieldDataType.Choice, null);
        await fields.AddChoiceAsync(status.Id, "Ready");
        await fields.AddChoiceAsync(status.Id, "Blocked");
        var retired = await fields.AddChoiceAsync(status.Id, "Retired");
        await fields.ArchiveAsync(legacy.Id);
        await fields.ArchiveChoiceAsync(status.Id, retired.Id);
    }

    private static async Task SeedProjectFieldsAsync(IServiceProvider services, Guid projectId)
    {
        var fields = services.GetRequiredService<FieldService>();
        await fields.CreateAsync("Project note", FieldDataType.Text, projectId);
        var risk = await fields.CreateAsync("Risk level", FieldDataType.Choice, projectId);
        await fields.AddChoiceAsync(risk.Id, "Low");
        await fields.AddChoiceAsync(risk.Id, "High");
    }

    private static async Task SeedSearchableItemsAsync(IServiceProvider services)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing DB");
        var folders = services.GetRequiredService<FolderService>();
        var dbo = await folders.CreateAsync(project.Id, null, "dbo");
        var tables = await folders.CreateAsync(project.Id, dbo.Id, "Tables");
        var items = services.GetRequiredService<ItemService>();
        var lookups = services.GetRequiredService<LookupService>();
        var types = await lookups.ItemTypesAsync();
        var priorities = await lookups.PriorityLevelsAsync();
        var change = types.Single(type => type.Name == "Change").Id;
        var error = types.Single(type => type.Name == "Error").Id;
        var high = priorities.Single(level => level.Name == "High").Id;
        var medium = priorities.Single(level => level.Name == "Medium").Id;
        var low = priorities.Single(level => level.Name == "Low").Id;
        var indexes = await items.CreateAsync(project.Id, tables.Id, null, "Review invoice indexes");
        var archive = await items.CreateAsync(project.Id, dbo.Id, null, "Review invoice archive");
        var finished = await items.CreateAsync(project.Id, null, null, "Review completed invoice");
        var longTitle = await items.CreateAsync(project.Id, null, null,
            "Review invoice reconciliation job with a very long title that has to be trimmed at the column edge");
        await items.EditAsync(indexes.Id, new ItemEdit(indexes.Title, null, "DB-101", change, high,
            new DateOnly(2026, 11, 20), new TimeOnly(14, 30), null, null));
        await items.EditAsync(archive.Id, new ItemEdit(archive.Title, null, "DB-102", error, medium,
            new DateOnly(2026, 11, 25), null, null, null));
        await items.EditAsync(finished.Id, new ItemEdit(finished.Title, null, "DB-99", change, high,
            new DateOnly(2026, 12, 1), null, null, null));
        await items.EditAsync(longTitle.Id, new ItemEdit(longTitle.Title, null, null, null, low,
            new DateOnly(2026, 12, 10), null, null, null));
        await items.SetCompletedAsync(project.Id, null, finished.Id, true);
    }

    private static void AddDueBetweenFilter(SearchViewModel page, DateOnly first, DateOnly second)
    {
        page.AddFilterCommand.Execute(null);
        var row = page.Filters[^1];
        row.SelectedField = row.Fields.Single(field => field.Key == "due");
        row.SelectedOperator = row.Operators.Single(option => option.Operator == FilterOperator.Between);
        row.FirstDate = first.ToDateTime(TimeOnly.MinValue);
        row.SecondDate = second.ToDateTime(TimeOnly.MinValue);
    }

    private static void AddTitleContainsFilter(SearchViewModel page, string text)
    {
        page.AddFilterCommand.Execute(null);
        var row = page.Filters[^1];
        row.SelectedField = row.Fields.Single(field => field.Key == "title");
        row.SelectedOperator = row.Operators.Single(option => option.Operator == FilterOperator.Contains);
        row.FirstText = text;
    }

    private static SearchFilterRowViewModel AddNumberFilter(
        SearchViewModel page, string fieldKey, FilterOperator operation)
    {
        page.AddFilterCommand.Execute(null);
        var row = page.Filters[^1];
        row.SelectedField = row.Fields.Single(field => field.Key == fieldKey);
        row.SelectedOperator = row.Operators.Single(option => option.Operator == operation);
        return row;
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Trash_with_several_batches_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        await TrashTestData.SeedAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark);
        await shell.GoHomeAsync();
        await shell.OpenTrashAsync();
        var page = Assert.IsType<TrashViewModel>(shell.CurrentPage);
        Assert.Equal(4, page.Batches.Count);
        Dispatcher.UIThread.RunJobs();
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"trash-batches-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Trash_with_an_inline_error_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        await TrashTestData.SeedAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark);
        await shell.GoHomeAsync();
        await shell.OpenTrashAsync();
        var page = Assert.IsType<TrashViewModel>(shell.CurrentPage);
        var staleRow = page.Batches.Single(row => row.Title == TrashTestData.DeletedItemName);
        await services.GetRequiredService<TrashService>().PurgeAsync(staleRow.BatchId);
        await page.RestoreAsync(staleRow);
        Assert.NotNull(page.Error);
        Assert.Equal(3, page.Batches.Count);
        Dispatcher.UIThread.RunJobs();
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"trash-error-{ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Empty_trash_matches_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark);
        await shell.GoHomeAsync();
        await shell.OpenTrashAsync();
        Dispatcher.UIThread.RunJobs();
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"trash-empty-{ThemeName(dark)}");
        window.Close();
    }

    internal static MainWindow OpenWindow(MainWindowViewModel shell, bool dark, int height = 800, int width = 1200)
    {
        Application.Current!.RequestedThemeVariant = dark ? ThemeVariant.Dark : ThemeVariant.Light;
        var window = new MainWindow { DataContext = shell, Width = width, Height = height };
        window.Show();
        return window;
    }

    internal static string ThemeName(bool dark)
    {
        return dark ? "dark" : "light";
    }
}