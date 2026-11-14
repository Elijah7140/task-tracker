using Avalonia.Controls;
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
    public async Task Back_with_unsaved_changes_asks_whether_to_discard_them()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var view = await OpenAppSettingsAsync(window, services);

        HeadlessInput.Click(window, HeadlessInput.Find<CheckBox>(view, "GlobalAutoCompleteCheckBox"));
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "AppSettingsBackButton"));

        var dialog = Assert.Single(window.OwnedWindows);
        Assert.Equal("Discard unsaved settings?", dialog.Title);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Cancelling_the_discard_prompt_stays_on_the_settings_page()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var view = await OpenAppSettingsAsync(window, services);
        HeadlessInput.Click(window, HeadlessInput.Find<CheckBox>(view, "GlobalAutoCompleteCheckBox"));
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "AppSettingsBackButton"));

        HeadlessInput.Press(Assert.Single(window.OwnedWindows), Key.Escape);

        Assert.IsType<AppSettingsViewModel>(shell.CurrentPage);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Save_defaults_persists_the_changed_setting()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var view = await OpenAppSettingsAsync(window, services);
        HeadlessInput.Click(window, HeadlessInput.Find<CheckBox>(view, "GlobalAutoCompleteCheckBox"));

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "AppSettingsSaveButton"));

        var settings = services.GetRequiredService<SettingsService>();
        var autoComplete = await settings.GetGlobalAsync(SettingsCatalogue.AutoCompleteParents);
        Assert.False(autoComplete);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Discarding_unsaved_defaults_navigates_home()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = services.GetRequiredService<MainWindowViewModel>();
        var view = await OpenAppSettingsAsync(window, services);
        HeadlessInput.Click(window, HeadlessInput.Find<CheckBox>(view, "GlobalAutoCompleteCheckBox"));
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "AppSettingsBackButton"));

        HeadlessInput.Press(Assert.Single(window.OwnedWindows), Key.Enter);

        Assert.IsType<HomeViewModel>(shell.CurrentPage);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Discarding_unsaved_defaults_does_not_persist_them()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var view = await OpenAppSettingsAsync(window, services);
        HeadlessInput.Click(window, HeadlessInput.Find<CheckBox>(view, "GlobalAutoCompleteCheckBox"));
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "AppSettingsBackButton"));

        HeadlessInput.Press(Assert.Single(window.OwnedWindows), Key.Enter);

        var settings = services.GetRequiredService<SettingsService>();
        var autoComplete = await settings.GetGlobalAsync(SettingsCatalogue.AutoCompleteParents);
        Assert.True(autoComplete);
        window.Close();
    }

    private static async Task<AppSettingsView> OpenAppSettingsAsync(MainWindow window, IServiceProvider services)
    {
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;
        window.Show();
        await shell.OpenAppSettingsAsync();
        Dispatcher.UIThread.RunJobs();

        return window.GetVisualDescendants().OfType<AppSettingsView>().Single();
    }
}