using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Styling;
using Avalonia.VisualTree;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Projects;
using TaskTracker.Infrastructure.Persistence;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests;

public sealed class MainWindowTests
{
    [AvaloniaFact]
    public async Task Home_renders_project_cards()
    {
        using var services = await CreateServicesAsync();
        var projects = services.GetRequiredService<ProjectService>();
        await projects.CreateAsync("Billing DB");
        await projects.CreateAsync("Website refresh");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };

        window.Show();
        await shell.GoHomeAsync();
        using var frame = window.CaptureRenderedFrame();

        Assert.Equal("Task Tracker", window.Title);
        Assert.NotNull(frame);
        Assert.NotEmpty(window.GetVisualDescendants().OfType<HomeView>());
        SaveScreenshotIfRequested(frame!, "home.png");
        window.Close();
    }

    [AvaloniaFact]
    public async Task Workspace_renders_nested_folders()
    {
        using var services = await CreateServicesAsync();
        var projects = services.GetRequiredService<ProjectService>();
        var folders = services.GetRequiredService<FolderService>();
        var project = await projects.CreateAsync("Billing DB");
        var schema = await folders.CreateAsync(project.Id, null, "dbo");
        await folders.CreateAsync(project.Id, schema.Id, "Tables");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };

        window.Show();
        await shell.OpenProjectAsync(project.Id);
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        page.Select(page.FolderRoots[0].Children[0].Children[0]);
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        Assert.NotEmpty(window.GetVisualDescendants().OfType<ProjectWorkspaceView>());
        SaveScreenshotIfRequested(frame!, "workspace.png");
        window.Close();
    }

    [AvaloniaFact]
    public async Task Tall_folder_tree_scrolls_inside_the_workspace()
    {
        using var services = await CreateServicesAsync();
        var projects = services.GetRequiredService<ProjectService>();
        var folders = services.GetRequiredService<FolderService>();
        var project = await projects.CreateAsync("Many folders");

        for (var index = 0; index < 35; index++)
        {
            await folders.CreateAsync(project.Id, null, $"Folder {index:00}");
        }

        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };

        window.Show();
        await shell.OpenProjectAsync(project.Id);
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SaveScreenshotIfRequested(frame!, "tall-tree.png");
        window.Close();
    }

    [AvaloniaFact]
    public async Task Dark_workspace_renders_nested_selection()
    {
        using var services = await CreateServicesAsync();
        var projects = services.GetRequiredService<ProjectService>();
        var folders = services.GetRequiredService<FolderService>();
        var project = await projects.CreateAsync("Billing DB");
        var parent = await folders.CreateAsync(project.Id, null, "dbo");
        await folders.CreateAsync(project.Id, parent.Id, "Tables");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var window = new MainWindow { DataContext = shell };
        var application = Avalonia.Application.Current!;
        var originalTheme = application.RequestedThemeVariant;

        application.RequestedThemeVariant = ThemeVariant.Dark;
        window.Show();
        await shell.OpenProjectAsync(project.Id);
        var page = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        page.Select(page.FolderRoots[0].Children[0].Children[0]);
        using var frame = window.CaptureRenderedFrame();

        Assert.NotNull(frame);
        SaveScreenshotIfRequested(frame!, "workspace-dark.png");
        window.Close();
        application.RequestedThemeVariant = originalTheme;
    }

    private static async Task<ServiceProvider> CreateServicesAsync()
    {
        var databasePath = Path.Combine(Path.GetTempPath(), $"tasktracker-screenshot-{Guid.CreateVersion7()}.db");
        Environment.SetEnvironmentVariable("TASKTRACKER_DB_PATH", databasePath);
        var services = CompositionRoot.BuildServices();
        using var scope = services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync();
        return services;
    }

    /// <summary>Writes the frame to $TASKTRACKER_SCREENSHOT_DIR when that variable is set.</summary>
    private static void SaveScreenshotIfRequested(Avalonia.Media.Imaging.Bitmap frame, string fileName)
    {
        var directory = Environment.GetEnvironmentVariable("TASKTRACKER_SCREENSHOT_DIR");
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
            frame.Save(Path.Combine(directory, fileName), new Avalonia.Media.Imaging.PngBitmapEncoderOptions());
        }
    }
}