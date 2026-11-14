using Avalonia;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Styling;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>Approved images of the principal application screens.</summary>
public sealed class ScreenSnapshotTests
{
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
        var window = OpenWindow(shell, dark);

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

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task App_settings_match_approved_image(bool dark)
    {
        using var services = await TestServices.CreateAsync();
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark);

        await shell.OpenAppSettingsAsync();
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
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = OpenWindow(shell, dark);

        await shell.OpenProjectSettingsAsync(project.Id);
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SnapshotComparer.AssertMatches(frame, $"project-settings-{ThemeName(dark)}");
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
        await items.EditAsync(child.Id, new ItemEdit(child.Title, null, "DB-120", change.Id,
            high.Id, new DateOnly(2026, 11, 12), null, null, null));
        await items.EditAsync(immediate.Id, new ItemEdit(immediate.Title, null, "DB-121", change.Id,
            high.Id, new DateOnly(2026, 11, 13), null, null, null));
        await items.EditAsync(approaching.Id, new ItemEdit(approaching.Title, null, null, null,
            null, new DateOnly(2026, 11, 15), null, null, null));
        await items.SetCompletedAsync(project.Id, null, finished.Id, true);
        return (project.Id, parent.Id);
    }

    private static MainWindow OpenWindow(MainWindowViewModel shell, bool dark)
    {
        Application.Current!.RequestedThemeVariant = dark ? ThemeVariant.Dark : ThemeVariant.Light;
        var window = new MainWindow { DataContext = shell, Width = 1200, Height = 800 };
        window.Show();
        return window;
    }

    private static string ThemeName(bool dark)
    {
        return dark ? "dark" : "light";
    }
}