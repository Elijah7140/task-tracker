using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Threading;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Items;
using TaskTracker.Core.Items.Recurrence;
using TaskTracker.Core.Projects;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests.Views;

/// <summary>Uses simulated input to save, skip, stop and complete repeating items.</summary>
public sealed class ItemRecurrenceViewTests
{
    private static readonly DateOnly Monday = new(2026, 11, 16);

    [AvaloniaFact]
    public async Task Repeat_editor_saves_a_weekly_rule_and_checkbox_completion_opens_the_next_row()
    {
        using var services = await TestServices.CreateAsync();
        var (projectId, itemId) = await CreateItemAsync(services, null);
        var (window, page) = await OpenAsync(services, projectId);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "ItemTitleButton"));
        await HeadlessInput.WaitUntilAsync(() => page.Editor?.Id == itemId);

        ChooseWeeklyRepeat(window);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "EditorSaveButton"));
        await HeadlessInput.WaitUntilAsync(() => page.OpenItems[0].Repeats);

        var marker = HeadlessInput.Find<TextBlock>(window, "ItemRepeatMarker");
        Assert.Equal("Weekly on Mon, Thu", ToolTip.GetTip(marker));
        HeadlessInput.Click(window, HeadlessInput.Find<CheckBox>(window, "ItemCompleteCheckBox"));
        await HeadlessInput.WaitUntilAsync(() => page.CompletedItems.Count == 1 && page.OpenItems.Count == 1);

        var next = Assert.Single(page.OpenItems);
        Assert.NotEqual(itemId, next.Id);
        Assert.Equal(Monday.AddDays(3), next.Node.Item.DueDate);
        Assert.False(next.IsComplete);
        window.Close();
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Skip_and_stop_work_from_the_editor_and_the_context_menu(bool fromMenu)
    {
        using var services = await TestServices.CreateAsync();
        var (projectId, itemId) = await CreateItemAsync(services, new RecurrenceRule(RecurrenceFrequency.Daily));
        var (window, page) = await OpenAsync(services, projectId);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "ItemTitleButton"));
        await HeadlessInput.WaitUntilAsync(() => page.Editor?.Id == itemId);

        ClickRepeatAction(window, fromMenu, "EditorSkipRepeatButton", "ItemSkipRepeatMenuItem");
        await HeadlessInput.WaitUntilAsync(() => page.OpenItems.SingleOrDefault()?.Node.Item.DueDate == Monday.AddDays(1)
            && page.Editor?.DueDate == Monday.AddDays(1));

        Assert.Equal(itemId, Assert.Single(page.OpenItems).Id);
        ClickRepeatAction(window, fromMenu, "EditorStopRepeatingButton", "ItemStopRepeatingMenuItem");
        await HeadlessInput.WaitUntilAsync(() => page.OpenItems.SingleOrDefault() is { Repeats: false });

        Assert.Empty(HeadlessInput.FindAll<TextBlock>(window, "ItemRepeatMarker"));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Completing_the_last_repeat_shows_the_end_status()
    {
        using var services = await TestServices.CreateAsync();
        var final = new RecurrenceRule(RecurrenceFrequency.Daily, EndKind: RecurrenceEndKind.AfterCount, Remaining: 1);
        var (projectId, _) = await CreateItemAsync(services, final);
        var (window, page) = await OpenAsync(services, projectId);

        HeadlessInput.Click(window, HeadlessInput.Find<CheckBox>(window, "ItemCompleteCheckBox"));
        await HeadlessInput.WaitUntilAsync(() => page.HasRecurrenceStatus);

        Assert.Empty(page.OpenItems);
        Assert.Equal("That was the last repeat.", HeadlessInput.Find<TextBlock>(window, "WorkspaceRecurrenceStatus").Text);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Typing_zero_as_a_month_day_blocks_save_until_last_day_is_checked()
    {
        using var services = await TestServices.CreateAsync();
        var (projectId, itemId) = await CreateItemAsync(services, null);
        var (window, page) = await OpenAsync(services, projectId);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "ItemTitleButton"));
        await HeadlessInput.WaitUntilAsync(() => page.Editor?.Id == itemId);
        HeadlessInput.Click(window, HeadlessInput.Find<Expander>(window, "EditorRepeatSection"));
        HeadlessInput.ChooseItem(window, HeadlessInput.Find<ComboBox>(window, "EditorRepeatFrequency"), "Monthly");
        var monthDay = HeadlessInput.Find<TextBox>(window, "EditorRepeatMonthDay");
        HeadlessInput.Click(window, monthDay);

        HeadlessInput.Press(window, Key.A, RawInputModifiers.Control);
        window.KeyTextInput("0");
        Dispatcher.UIThread.RunJobs();

        var save = HeadlessInput.Find<Button>(window, "EditorSaveButton");
        Assert.Equal("0", monthDay.Text);
        Assert.False(save.IsEffectivelyEnabled);
        var error = HeadlessInput.Find<TextBlock>(window, "EditorRepeatError");
        Assert.Equal("Enter a day of the month from 1 to 31.", error.Text);

        HeadlessInput.Click(window, HeadlessInput.Find<CheckBox>(window, "EditorRepeatLastDay"));
        Assert.True(save.IsEffectivelyEnabled);
        HeadlessInput.Click(window, save);
        await HeadlessInput.WaitUntilAsync(() => page.OpenItems[0].Node.Item.Recurrence?.MonthDay == 0);
        window.Close();
    }

    private static void ChooseWeeklyRepeat(MainWindow window)
    {
        HeadlessInput.Click(window, HeadlessInput.Find<Expander>(window, "EditorRepeatSection"));
        var frequency = HeadlessInput.Find<ComboBox>(window, "EditorRepeatFrequency");
        HeadlessInput.ChooseItem(window, frequency, "Weekly");
        HeadlessInput.Click(window, HeadlessInput.Find<CheckBox>(window, "EditorRepeatThursday"));

        Assert.Equal("Weekly on Mon, Thu", HeadlessInput.Find<TextBlock>(window, "EditorRepeatSummary").Text);
    }

    private static void ClickRepeatAction(MainWindow window, bool fromMenu, string editorId, string menuId)
    {
        if (!fromMenu)
        {
            HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, editorId));
            return;
        }

        var row = HeadlessInput.Find<Border>(window, "ItemDragRow");
        var point = HeadlessInput.CentreOf(window, row);
        window.MouseDown(point, MouseButton.Right, RawInputModifiers.None);
        window.MouseUp(point, MouseButton.Right, RawInputModifiers.None);
        Dispatcher.UIThread.RunJobs();
        Assert.True(row.ContextMenu!.IsOpen);
        var action = Assert.Single(row.ContextMenu.Items.OfType<MenuItem>(), item => AutomationProperties.GetAutomationId(item) == menuId);
        HeadlessInput.Click(window, action);
    }

    private static async Task<(Guid ProjectId, Guid ItemId)> CreateItemAsync(IServiceProvider services, RecurrenceRule? rule)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Reports");
        var items = services.GetRequiredService<ItemService>();
        var item = await items.CreateAsync(project.Id, null, null, "Review figures");
        var edit = new ItemEdit(item.Title, null, null, null, null, Monday, null, null, null)
        {
            UpdateRecurrence = true,
            Recurrence = rule
        };
        await items.EditAsync(item.Id, edit);
        return (project.Id, item.Id);
    }

    private static async Task<(MainWindow Window, ProjectWorkspaceViewModel Page)> OpenAsync(IServiceProvider services, Guid projectId)
    {
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = ScreenSnapshotTests.OpenWindow(shell, dark: false, height: 1250);
        await shell.OpenProjectAsync(projectId);
        Dispatcher.UIThread.RunJobs();
        return (window, Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage));
    }
}