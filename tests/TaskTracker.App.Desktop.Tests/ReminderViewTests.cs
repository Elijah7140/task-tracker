using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Threading;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Reminders;
using TaskTracker.Presentation.Reminders;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>Drives the bell, shortcut, snooze menu, and editor using headless pointer and keyboard input.</summary>
public sealed class ReminderViewTests
{
    [AvaloniaFact]
    public async Task Bell_badge_and_keyboard_shortcut_track_the_panel()
    {
        using var services = await TestServices.CreateAsync();
        await SeedAsync(services, "Review invoices");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        using var scheduler = StartPanel(services, shell);
        var window = ScreenSnapshotTests.OpenWindow(shell, false);
        await scheduler.StartAsync();

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "ReminderBell"));

        Assert.True(shell.Reminders!.IsOpen);
        Assert.Equal("1", HeadlessInput.Find<TextBlock>(window, "ReminderBadge").Text);
        Assert.NotNull(HeadlessInput.Find<UserControl>(window, "RemindersPanel"));
        HeadlessInput.Press(window, Key.R, RawInputModifiers.Control | RawInputModifiers.Shift);
        Assert.Empty(HeadlessInput.FindAll<UserControl>(window, "RemindersPanel"));
        HeadlessInput.Press(window, Key.R, RawInputModifiers.Control | RawInputModifiers.Shift);
        Assert.NotNull(HeadlessInput.Find<UserControl>(window, "RemindersPanel"));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Snoozing_from_the_panel_removes_the_badge_and_defers_delivery()
    {
        using var services = await TestServices.CreateAsync();
        var item = await SeedAsync(services, "Review invoices");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        using var scheduler = StartPanel(services, shell);
        var window = ScreenSnapshotTests.OpenWindow(shell, false);
        await scheduler.StartAsync();
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "ReminderBell"));

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "ReminderSnooze"));
        HeadlessInput.Click(window, HeadlessInput.Find<MenuItem>(window, "ReminderSnoozeTenMinutes"));

        await HeadlessInput.WaitUntilAsync(() => shell.Reminders!.Count == 0);
        Assert.Empty(HeadlessInput.FindAll<TextBlock>(window, "ReminderBadge"));
        var reminders = services.GetRequiredService<ReminderService>();
        var later = TestServices.Clock.GetUtcNow().UtcDateTime.AddMinutes(10);
        Assert.Equal(item.Id, Assert.Single(await reminders.DueAsync(later, null)).ItemId);
        window.Close();
    }

    [AvaloniaFact]
    public async Task The_editor_saves_a_reminder_choice_selected_with_the_mouse()
    {
        using var services = await TestServices.CreateAsync();
        var item = await SeedAsync(services, "Review invoices");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = ScreenSnapshotTests.OpenWindow(shell, false, height: 1400);
        await OpenEditorAsync(shell, item);
        var choice = HeadlessInput.Find<ComboBox>(window, "EditorReminderChoice");

        HeadlessInput.ChooseItem(window, choice, "15 minutes before");
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "EditorSaveButton"));

        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        await HeadlessInput.WaitUntilAsync(() => !page.HasUnsavedChanges);
        var reminders = services.GetRequiredService<ReminderService>();
        var result = Assert.Single(await reminders.DueAsync());
        Assert.Equal(TestServices.Clock.GetUtcNow().UtcDateTime.AddMinutes(-15), result.InstantUtc);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Panel_with_two_reminders_matches_the_approved_image(bool dark)
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "Reminder snapshot baselines are approved on Windows.");
        using var services = await TestServices.CreateAsync();
        await SeedAsync(services, "Review invoices");
        await SeedAsync(services, "Send the weekly report", minutesBeforeNow: 1);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        using var scheduler = StartPanel(services, shell);
        var window = ScreenSnapshotTests.OpenWindow(shell, dark);
        await shell.GoHomeAsync();
        await scheduler.StartAsync();
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "ReminderBell"));

        Assert.True(shell.Reminders!.IsOpen);
        Assert.Equal(2, HeadlessInput.FindAll<Button>(window, "ReminderOpen").Count);
        Capture(window, $"reminders-panel-{ScreenSnapshotTests.ThemeName(dark)}");
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Editor_reminder_section_matches_the_approved_image(bool dark)
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "Reminder snapshot baselines are approved on Windows.");
        using var services = await TestServices.CreateAsync();
        var item = await SeedAsync(services, "Review invoices");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        using var scheduler = StartPanel(services, shell);
        var window = ScreenSnapshotTests.OpenWindow(shell, dark, height: 1240);
        await OpenEditorAsync(shell, item);
        HeadlessInput.Find<ComboBox>(window, "EditorReminderChoice").BringIntoView();

        Capture(window, $"editor-reminder-{ScreenSnapshotTests.ThemeName(dark)}");
        window.Close();
    }

    private static ReminderScheduler StartPanel(IServiceProvider services, MainWindowViewModel shell)
    {
        var panel = shell.EnableReminders(services.GetRequiredService<ReminderService>());
        var scheduler = services.GetRequiredService<ReminderScheduler>();
        scheduler.Delivered += panel.Add;
        scheduler.RefreshPanelAsync = panel.RefreshAsync;
        return scheduler;
    }

    private static async Task OpenEditorAsync(MainWindowViewModel shell, TodoItem item)
    {
        await shell.OpenProjectAsync(item.ProjectId);
        var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        await workspace.SelectItemAsync(Assert.Single(workspace.OpenItems));
        Dispatcher.UIThread.RunJobs();
    }

    private static async Task<TodoItem> SeedAsync(IServiceProvider services, string title, int minutesBeforeNow = 0)
    {
        var projects = services.GetRequiredService<ProjectService>();
        var project = await projects.CreateAsync(title == "Review invoices" ? "Operations" : "Reporting");
        var items = services.GetRequiredService<ItemService>();
        var item = await items.CreateAsync(project.Id, null, null, title);
        var due = TestServices.Clock.GetUtcNow().UtcDateTime.AddMinutes(-minutesBeforeNow);
        var edit = new ItemEdit(title, null, null, null, null, DateOnly.FromDateTime(due), TimeOnly.FromDateTime(due), null, null)
        {
            UpdateReminder = true,
            ReminderMode = ReminderMode.Offset,
            ReminderOffsetMinutes = 0,
        };
        await items.EditAsync(item.Id, edit);
        return item;
    }

    private static void Capture(Window window, string name)
    {
        Dispatcher.UIThread.RunJobs();
        using var frame = window.CaptureRenderedFrame();
        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, name);
    }
}