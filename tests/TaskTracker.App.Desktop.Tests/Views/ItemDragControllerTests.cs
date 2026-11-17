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

/// <summary>Pointer gestures on item rows, driven through simulated mouse input.</summary>
public sealed class ItemDragControllerTests
{
    private static readonly string[] DropClasses = ["dropBefore", "dropAfter", "dropInto"];

    [AvaloniaFact]
    public async Task Right_press_while_left_is_held_on_empty_space_does_not_start_a_drag()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project");
        var items = services.GetRequiredService<ItemService>();
        var first = await items.CreateAsync(project.Id, null, null, "First");
        var second = await items.CreateAsync(project.Id, null, null, "Second");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = await OpenWorkspaceAsync(shell, project.Id);
        var firstRow = FindRow(window, first.Id);
        var secondRow = FindRow(window, second.Id);
        var scroll = FindItemScroll(window);
        var emptySpace = HeadlessInput.PointIn(window, scroll, scroll.Bounds.Width / 2, scroll.Bounds.Height - 20);
        var rowStart = HeadlessInput.CentreOf(window, secondRow);
        var rowEnd = HeadlessInput.CentreOf(window, firstRow);
        const RawInputModifiers bothButtons = RawInputModifiers.LeftMouseButton | RawInputModifiers.RightMouseButton;

        HeadlessInput.PressMouse(window, emptySpace);
        HeadlessInput.PressMouse(window, rowStart, MouseButton.Right, RawInputModifiers.LeftMouseButton);
        HeadlessInput.MoveMouse(window, rowEnd, bothButtons);
        var anyFeedback = AllRows(window).Any(row => HasDragFeedback(row));
        HeadlessInput.ReleaseMouse(window, rowEnd, MouseButton.Right, RawInputModifiers.LeftMouseButton);
        HeadlessInput.ReleaseMouse(window, rowEnd);
        var snapshot = await items.LoadAreaAsync(project.Id, null);

        Assert.False(anyFeedback);
        Assert.Equal([first.Id, second.Id], snapshot.Items.Select(node => node.Item.Id));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Right_press_during_an_active_drag_does_not_replace_its_source()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project");
        var items = services.GetRequiredService<ItemService>();
        var first = await items.CreateAsync(project.Id, null, null, "First");
        var second = await items.CreateAsync(project.Id, null, null, "Second");
        var third = await items.CreateAsync(project.Id, null, null, "Third");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = await OpenWorkspaceAsync(shell, project.Id);
        var firstRow = FindRow(window, first.Id);
        var secondRow = FindRow(window, second.Id);
        var thirdRow = FindRow(window, third.Id);
        var target = HeadlessInput.CentreOf(window, firstRow);

        HeadlessInput.PressMouse(window, HeadlessInput.CentreOf(window, secondRow));
        HeadlessInput.MoveMouse(window, target);
        HeadlessInput.PressMouse(window, HeadlessInput.CentreOf(window, thirdRow),
            MouseButton.Right, RawInputModifiers.LeftMouseButton);
        var originalSourceIsDragging = secondRow.Classes.Contains("dragging");
        var thirdIsDragging = thirdRow.Classes.Contains("dragging");
        HeadlessInput.ReleaseMouse(window, HeadlessInput.CentreOf(window, thirdRow),
            MouseButton.Right, RawInputModifiers.LeftMouseButton);
        HeadlessInput.Press(window, Key.Escape);
        HeadlessInput.ReleaseMouse(window, target);
        var snapshot = await items.LoadAreaAsync(project.Id, null);

        Assert.True(originalSourceIsDragging);
        Assert.False(thirdIsDragging);
        Assert.Equal([first.Id, second.Id, third.Id], snapshot.Items.Select(node => node.Item.Id));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Rows_scrolled_out_of_the_viewport_are_not_drop_targets()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project");
        var items = services.GetRequiredService<ItemService>();
        var created = new List<TodoItem>();

        for (var number = 1; number <= 40; number++)
        {
            created.Add(await items.CreateAsync(project.Id, null, null, $"Item {number}"));
        }

        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = await OpenWorkspaceAsync(shell, project.Id);
        var scroll = FindItemScroll(window);
        scroll.Offset = new Vector(0, scroll.Extent.Height - scroll.Viewport.Height);
        Dispatcher.UIThread.RunJobs();
        var last = FindRow(window, created[^1].Id);
        var aboveViewport = HeadlessInput.PointIn(window, scroll, scroll.Bounds.Width / 2, -10);

        HeadlessInput.PressMouse(window, HeadlessInput.CentreOf(window, last));
        HeadlessInput.MoveMouse(window, aboveViewport);
        var anyFeedback = AllRows(window).Any(row => HasDropIndicator(row));
        HeadlessInput.ReleaseMouse(window, aboveViewport);
        var snapshot = await items.LoadAreaAsync(project.Id, null);

        Assert.True(scroll.Offset.Y > 20, "The list must be scrolled for this test to mean anything.");
        Assert.False(anyFeedback);
        Assert.Equal(created.Select(item => item.Id), snapshot.Items.Select(node => node.Item.Id));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Dropping_before_a_completed_row_shows_no_indicator_and_changes_nothing()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project");
        var items = services.GetRequiredService<ItemService>();
        var open = await items.CreateAsync(project.Id, null, null, "Open");
        var done = await items.CreateAsync(project.Id, null, null, "Done");
        await items.SetCompletedAsync(project.Id, null, done.Id, true);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = await OpenWorkspaceAsync(shell, project.Id);
        Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage).IsCompletedExpanded = true;
        Dispatcher.UIThread.RunJobs();
        var doneRow = FindRow(window, done.Id);
        var topEdge = HeadlessInput.PointIn(window, doneRow, doneRow.Bounds.Width / 2, 2);

        HeadlessInput.PressMouse(window, HeadlessInput.CentreOf(window, FindRow(window, open.Id)));
        HeadlessInput.MoveMouse(window, topEdge);
        var indicator = HasDropIndicator(doneRow);
        HeadlessInput.ReleaseMouse(window, topEdge);
        var snapshot = await items.LoadAreaAsync(project.Id, null);

        Assert.False(indicator);
        Assert.Equal([open.Id, done.Id], snapshot.Items.Select(node => node.Item.Id));
        Assert.Equal([0, 1], snapshot.Items.Select(node => node.Item.SortOrder));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Drop_into_tints_the_target_labels_it_and_dims_the_dragged_row()
    {
        using var services = await TestServices.CreateAsync();
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Project");
        var items = services.GetRequiredService<ItemService>();
        var first = await items.CreateAsync(project.Id, null, null, "First");
        var second = await items.CreateAsync(project.Id, null, null, "Second");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = await OpenWorkspaceAsync(shell, project.Id);
        var firstRow = FindRow(window, first.Id);
        var secondRow = FindRow(window, second.Id);
        var middle = HeadlessInput.CentreOf(window, firstRow);

        HeadlessInput.PressMouse(window, HeadlessInput.CentreOf(window, secondRow));
        HeadlessInput.MoveMouse(window, middle);
        var dragging = secondRow.Classes.Contains("dragging");
        var hint = HeadlessInput.FindAll<TextBlock>(firstRow, "DropIntoHint");
        var tint = Assert.IsAssignableFrom<ISolidColorBrush>(firstRow.Background);
        HeadlessInput.Press(window, Key.Escape);

        Assert.True(dragging);
        Assert.Single(hint);
        Assert.True(tint.Opacity < 1);
        Assert.DoesNotContain("dragging", secondRow.Classes);
        Assert.Empty(HeadlessInput.FindAll<TextBlock>(firstRow, "DropIntoHint"));
        window.Close();
    }

    private static async Task<MainWindow> OpenWorkspaceAsync(MainWindowViewModel shell, Guid projectId)
    {
        var window = new MainWindow { DataContext = shell };
        window.Show();
        await shell.OpenProjectAsync(projectId);
        Dispatcher.UIThread.RunJobs();
        return window;
    }

    private static List<Border> AllRows(Window window)
    {
        return window.GetVisualDescendants().OfType<Border>()
            .Where(border => border.Classes.Contains("itemRow")).ToList();
    }

    private static Border FindRow(Window window, Guid itemId)
    {
        return AllRows(window).Single(row => (row.DataContext as ItemRowViewModel)?.Id == itemId);
    }

    private static ScrollViewer FindItemScroll(Window window)
    {
        return window.GetVisualDescendants().OfType<ScrollViewer>()
            .Single(viewer => viewer.Name == "ItemsScrollViewer");
    }

    private static bool HasDragFeedback(Border row)
    {
        return row.Classes.Contains("dragging") || HasDropIndicator(row);
    }

    private static bool HasDropIndicator(Border row)
    {
        return DropClasses.Any(row.Classes.Contains);
    }
}