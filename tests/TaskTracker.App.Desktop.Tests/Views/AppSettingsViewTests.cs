using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Threading;
using Avalonia.VisualTree;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Settings;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests.Views;

/// <summary>Exercises the global settings form through mouse input.</summary>
public sealed class AppSettingsViewTests
{
    [AvaloniaFact]
    public async Task Back_with_unsaved_changes_prompts_and_save_persists()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;

        window.Show();
        await shell.OpenAppSettingsAsync();
        Dispatcher.UIThread.RunJobs();
        var view = window.GetVisualDescendants().OfType<AppSettingsView>().Single();
        var toggle = view.GetVisualDescendants().OfType<CheckBox>().Single();
        Click(window, toggle);
        Click(window, FindButton(view, "← Back"));
        Dispatcher.UIThread.RunJobs();
        var dialog = Assert.Single(window.OwnedWindows);
        Assert.Equal("Discard unsaved settings?", dialog.Title);
        dialog.KeyPress(Key.Escape, RawInputModifiers.None, PhysicalKey.None, null);
        Dispatcher.UIThread.RunJobs();
        Assert.IsType<AppSettingsViewModel>(shell.CurrentPage);
        Click(window, FindButton(view, "Save defaults"));
        Dispatcher.UIThread.RunJobs();

        var settings = services.GetRequiredService<SettingsService>();
        Assert.False(await settings.GetGlobalAsync(SettingsCatalogue.AutoCompleteParents));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Discarding_unsaved_defaults_navigates_home_without_persisting()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;
        window.Show();
        await shell.OpenAppSettingsAsync();
        Dispatcher.UIThread.RunJobs();
        var view = window.GetVisualDescendants().OfType<AppSettingsView>().Single();

        Click(window, view.GetVisualDescendants().OfType<CheckBox>().Single());
        Click(window, FindButton(view, "← Back"));
        Dispatcher.UIThread.RunJobs();
        var dialog = Assert.Single(window.OwnedWindows);
        dialog.KeyPress(Key.Enter, RawInputModifiers.None, PhysicalKey.None, null);
        Dispatcher.UIThread.RunJobs();

        Assert.IsType<HomeViewModel>(shell.CurrentPage);
        var saved = await services.GetRequiredService<SettingsService>()
            .GetGlobalAsync(SettingsCatalogue.AutoCompleteParents);
        Assert.True(saved);
        window.Close();
    }

    private static Button FindButton(Control view, string label)
    {
        return view.GetVisualDescendants().OfType<Button>()
            .Single(button => Equals(button.Content, label));
    }

    private static void Click(Window window, Control control)
    {
        var point = control.TranslatePoint(new Point(control.Bounds.Width / 2, control.Bounds.Height / 2), window)!.Value;
        window.MouseDown(point, MouseButton.Left, RawInputModifiers.None);
        window.MouseUp(point, MouseButton.Left, RawInputModifiers.None);
    }
}