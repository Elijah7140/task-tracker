using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Threading;
using Avalonia.VisualTree;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Settings;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests.Views;

/// <summary>Exercises project overrides through mouse input.</summary>
public sealed class ProjectSettingsViewTests
{
    [AvaloniaFact]
    public async Task Back_with_unsaved_override_prompts_and_save_persists()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;

        window.Show();
        await shell.OpenProjectSettingsAsync(project.Id);
        Dispatcher.UIThread.RunJobs();
        var view = window.GetVisualDescendants().OfType<ProjectSettingsView>().Single();
        ChangeOverrideAndGoBack(window, view);
        var dialog = Assert.Single(window.OwnedWindows);
        Assert.Equal("Discard unsaved settings?", dialog.Title);
        dialog.KeyPress(Key.Escape, RawInputModifiers.None, PhysicalKey.None, null);
        Dispatcher.UIThread.RunJobs();
        Assert.IsType<ProjectSettingsViewModel>(shell.CurrentPage);
        Click(window, view.GetVisualDescendants().OfType<Button>()
            .Single(button => Equals(button.Content, "Save")));
        Dispatcher.UIThread.RunJobs();

        var settings = await services.GetRequiredService<SettingsService>().GetEffectiveAsync(project.Id);
        Assert.Equal(SettingSource.Project, settings.AutoCompleteParents.Source);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Discarding_unsaved_override_navigates_to_project_without_persisting()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;
        window.Show();
        await shell.OpenProjectSettingsAsync(project.Id);
        Dispatcher.UIThread.RunJobs();
        var view = window.GetVisualDescendants().OfType<ProjectSettingsView>().Single();

        ChangeOverrideAndGoBack(window, view);
        var dialog = Assert.Single(window.OwnedWindows);
        dialog.KeyPress(Key.Enter, RawInputModifiers.None, PhysicalKey.None, null);
        Dispatcher.UIThread.RunJobs();

        Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        var saved = await services.GetRequiredService<SettingsService>().GetEffectiveAsync(project.Id);
        Assert.Equal(SettingSource.Global, saved.AutoCompleteParents.Source);
        window.Close();
    }

    private static void ChangeOverrideAndGoBack(Window window, ProjectSettingsView view)
    {
        Click(window, view.GetVisualDescendants().OfType<CheckBox>()
            .First(box => Equals(box.Content, "Override")));
        Click(window, view.GetVisualDescendants().OfType<Button>()
            .Single(button => Equals(button.Content, "← Back to project")));
        Dispatcher.UIThread.RunJobs();
    }
    private static void Click(Window window, Control control)
    {
        var point = control.TranslatePoint(new Point(control.Bounds.Width / 2, control.Bounds.Height / 2), window)!.Value;
        window.MouseDown(point, MouseButton.Left, RawInputModifiers.None);
        window.MouseUp(point, MouseButton.Left, RawInputModifiers.None);
    }
}