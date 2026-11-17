using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Threading;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.Core.Items;
using TaskTracker.Core.Items.Recurrence;
using TaskTracker.Core.Projects;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>Snapshots of the Repeat section and the workspace repeat marker.</summary>
public sealed class RecurrenceSnapshotTests
{
    [AvaloniaTheory]
    [InlineData(false, false)]
    [InlineData(false, true)]
    [InlineData(true, false)]
    [InlineData(true, true)]
    public async Task Weekly_recurrence_matches_the_approved_image(bool dark, bool showEditor)
    {
        using var services = await TestServices.CreateAsync();
        var projectId = await SeedAsync(services);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = ScreenSnapshotTests.OpenWindow(shell, dark, height: showEditor ? 920 : 800);
        await shell.OpenProjectAsync(projectId);

        if (showEditor)
        {
            var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
            await page.SelectItemAsync(page.OpenItems[0]);
            Dispatcher.UIThread.RunJobs();
            HeadlessInput.Find<Button>(window, "EditorStopRepeatingButton").BringIntoView();
        }

        Dispatcher.UIThread.RunJobs();
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        var screen = showEditor ? "editor-weekly-repeat" : "workspace-repeating-row";
        SnapshotComparer.AssertMatches(frame, $"{screen}-{ScreenSnapshotTests.ThemeName(dark)}");
        window.Close();
    }

    private static async Task<Guid> SeedAsync(IServiceProvider services)
    {
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Operations");
        var items = services.GetRequiredService<ItemService>();
        var item = await items.CreateAsync(project.Id, null, null, "Review weekly figures");
        await items.CreateAsync(project.Id, null, null, "Archive October reports");
        var edit = new ItemEdit(item.Title, null, "OPS-17", null, null, new DateOnly(2026, 11, 16), null, null, null)
        {
            UpdateRecurrence = true,
            Recurrence = new RecurrenceRule(RecurrenceFrequency.Weekly, 2, RecurrenceWeekdays.Monday | RecurrenceWeekdays.Thursday)
        };
        await items.EditAsync(item.Id, edit);
        return project.Id;
    }
}