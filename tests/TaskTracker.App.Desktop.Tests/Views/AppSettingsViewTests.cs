using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Threading;
using Avalonia.VisualTree;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Settings;
using TaskTracker.Presentation.Installation;
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
    public async Task Saving_reminder_defaults_persists_the_offset_and_time_chosen_in_the_view()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var settings = services.GetRequiredService<SettingsService>();
        await settings.SetGlobalAsync(SettingsCatalogue.DefaultReminderOffset, TimeSpan.FromMinutes(45));
        var view = await OpenAppSettingsAsync(window, services);
        var offset = HeadlessInput.Find<ComboBox>(view, "GlobalReminderOffset");
        var time = HeadlessInput.Find<TimePicker>(view, "GlobalDateOnlyReminderTime");
        var page = Assert.IsType<AppSettingsViewModel>(view.DataContext);
        Assert.Equal("45 minutes before", Assert.IsType<ReminderChoice>(offset.SelectedItem).Label);

        HeadlessInput.ChooseItem(window, offset, "15 minutes before");
        HeadlessInput.AdvanceTimePickerHour(window, time);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "AppSettingsSaveButton"));
        await HeadlessInput.WaitUntilAsync(() => !page.IsDirty);

        Assert.Equal(TimeSpan.FromMinutes(15), await settings.GetGlobalAsync(SettingsCatalogue.DefaultReminderOffset));
        Assert.Equal(new TimeOnly(10, 0), await settings.GetGlobalAsync(SettingsCatalogue.DateOnlyReminderTime));
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

    [AvaloniaFact]
    public async Task The_about_line_shows_the_app_version()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);

        var view = await OpenAppSettingsAsync(window, services);

        Assert.Equal("Task Tracker version 0.1.0", HeadlessInput.Find<TextBlock>(view, "AboutVersion").Text);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Clicking_check_for_updates_offers_a_newer_release()
    {
        var window = new MainWindow();
        var updates = new FakeUpdateService { CheckResult = UpdateCheckResult.Available("0.2.0") };
        using var services = await TestServices.CreateAsync(window, installation: TestServices.CreateInstallation(updates));
        var view = await OpenAppSettingsAsync(window, services);

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "CheckForUpdatesButton"));
        await HeadlessInput.WaitUntilAsync(() => IsShown(view, "DownloadUpdateButton"));

        Assert.Equal("Version 0.2.0 is available.", HeadlessInput.Find<TextBlock>(view, "UpdateStatus").Text);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Clicking_check_for_updates_in_an_uninstalled_build_explains_why_there_are_none()
    {
        var window = new MainWindow();
        var updates = new FakeUpdateService { IsInstalled = false };
        using var services = await TestServices.CreateAsync(window, installation: TestServices.CreateInstallation(updates));
        var view = await OpenAppSettingsAsync(window, services);

        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "CheckForUpdatesButton"));
        await HeadlessInput.WaitUntilAsync(() => IsShown(view, "UpdateStatus"));

        Assert.Equal(AppUpdateViewModel.NotInstalledText, HeadlessInput.Find<TextBlock>(view, "UpdateStatus").Text);
        Assert.False(IsShown(view, "DownloadUpdateButton"));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Restart_prompts_for_edits_made_while_the_update_downloaded()
    {
        var window = new MainWindow();
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var updates = new FakeUpdateService { CheckResult = UpdateCheckResult.Available("0.2.0"), DownloadGate = gate };
        using var services = await TestServices.CreateAsync(window, installation: TestServices.CreateInstallation(updates));
        var view = await OpenAppSettingsAsync(window, services);
        var page = Assert.IsType<AppSettingsViewModel>(view.DataContext);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "CheckForUpdatesButton"));
        await HeadlessInput.WaitUntilAsync(() => IsShown(view, "DownloadUpdateButton"));
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "DownloadUpdateButton"));
        await HeadlessInput.WaitUntilAsync(() => updates.DownloadCount == 1);
        HeadlessInput.Click(window, HeadlessInput.Find<CheckBox>(view, "GlobalAutoCompleteCheckBox"));
        Assert.True(page.IsDirty);
        Assert.Empty(window.OwnedWindows);

        gate.SetResult();
        await HeadlessInput.WaitUntilAsync(() => IsShown(view, "RestartToUpdateButton"));
        Assert.Equal(0, updates.RestartCount);
        Assert.Empty(window.OwnedWindows);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "RestartToUpdateButton"));
        var dialog = Assert.Single(window.OwnedWindows);
        Assert.Equal("Discard unsaved settings?", dialog.Title);
        HeadlessInput.Press(dialog, Key.Escape);

        Assert.True(page.IsDirty);
        Assert.Equal(0, updates.RestartCount);
        Assert.Equal(AppUpdateViewModel.ReadyToRestartText, HeadlessInput.Find<TextBlock>(view, "UpdateStatus").Text);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "RestartToUpdateButton"));
        HeadlessInput.Press(Assert.Single(window.OwnedWindows), Key.Enter);
        await HeadlessInput.WaitUntilAsync(() => updates.RestartCount == 1);
        Assert.Equal(1, updates.DownloadCount);
        window.Close();
    }

    [AvaloniaFact]
    public async Task An_update_can_be_restarted_after_returning_to_settings()
    {
        var window = new MainWindow();
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var updates = new FakeUpdateService { CheckResult = UpdateCheckResult.Available("0.2.0"), DownloadGate = gate };
        using var services = await TestServices.CreateAsync(window, installation: TestServices.CreateInstallation(updates));
        var view = await OpenAppSettingsAsync(window, services);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "CheckForUpdatesButton"));
        await HeadlessInput.WaitUntilAsync(() => IsShown(view, "DownloadUpdateButton"));
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "DownloadUpdateButton"));
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "AppSettingsBackButton"));
        var shell = services.GetRequiredService<MainWindowViewModel>();
        await HeadlessInput.WaitUntilAsync(() => shell.CurrentPage is HomeViewModel);

        gate.SetResult();
        await shell.OpenAppSettingsAsync();
        view = window.GetVisualDescendants().OfType<AppSettingsView>().Single();
        await HeadlessInput.WaitUntilAsync(() => IsShown(view, "RestartToUpdateButton"));
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "RestartToUpdateButton"));

        await HeadlessInput.WaitUntilAsync(() => updates.RestartCount == 1);
        Assert.Empty(window.OwnedWindows);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Start_with_system_is_hidden_where_it_is_unavailable()
    {
        var window = new MainWindow();
        var startup = new FakeStartupRegistration { IsAvailable = false };
        using var services = await TestServices.CreateAsync(window, installation: TestServices.CreateInstallation(startup: startup));

        var view = await OpenAppSettingsAsync(window, services);

        Assert.False(IsShown(view, "StartWithSystem"));
        window.Close();
    }

    [AvaloniaFact]
    public async Task Ticking_start_with_system_and_saving_persists_it_and_writes_the_entry()
    {
        var window = new MainWindow();
        var startup = new FakeStartupRegistration { IsAvailable = true };
        using var services = await TestServices.CreateAsync(window, installation: TestServices.CreateInstallation(startup: startup));
        var view = await OpenAppSettingsAsync(window, services);
        var page = Assert.IsType<AppSettingsViewModel>(view.DataContext);

        HeadlessInput.Click(window, HeadlessInput.Find<CheckBox>(view, "StartWithSystem"));
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(view, "AppSettingsSaveButton"));
        await HeadlessInput.WaitUntilAsync(() => !page.IsDirty);

        var settings = services.GetRequiredService<SettingsService>();
        Assert.True(await settings.GetGlobalAsync(SettingsCatalogue.StartWithSystem));
        Assert.Equal([true], startup.Applied);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Title_bar_settings_button_opens_settings_from_home_and_Back_returns_home()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var shell = await ShowHomeWithTitleBarAsync(window, services);

        await ClickAndWaitForPageAsync<AppSettingsViewModel>(window, shell, "TopSettingsButton");
        await ClickAndWaitForPageAsync<HomeViewModel>(window, shell, "AppSettingsBackButton");

        window.Close();
    }

    [AvaloniaFact]
    public async Task Title_bar_settings_button_from_a_workspace_returns_to_that_project()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var shell = await ShowHomeWithTitleBarAsync(window, services);
        await shell.OpenProjectAsync(project.Id);

        await ClickAndWaitForPageAsync<AppSettingsViewModel>(window, shell, "TopSettingsButton");
        await ClickAndWaitForPageAsync<ProjectWorkspaceViewModel>(window, shell, "AppSettingsBackButton");

        var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        Assert.Equal(project.Id, workspace.ProjectId);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Title_bar_settings_button_leaves_search_for_settings_that_return_to_the_project_behind_it()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var shell = await ShowHomeWithTitleBarAsync(window, services);
        await shell.OpenProjectAsync(project.Id);
        await ClickAndWaitForPageAsync<SearchViewModel>(window, shell, "TopSearchButton");

        await ClickAndWaitForPageAsync<AppSettingsViewModel>(window, shell, "TopSettingsButton");
        await ClickAndWaitForPageAsync<ProjectWorkspaceViewModel>(window, shell, "AppSettingsBackButton");

        var workspace = Assert.IsType<ProjectWorkspaceViewModel>(shell.CurrentPage);
        Assert.Equal(project.Id, workspace.ProjectId);
        window.Close();
    }

    [AvaloniaFact]
    public async Task Title_bar_hides_the_reminder_bell_when_reminders_are_off()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);

        await ShowHomeWithTitleBarAsync(window, services);

        Assert.True(HeadlessInput.Find<Button>(window, "TopSettingsButton").IsEffectivelyVisible);
        Assert.Empty(HeadlessInput.FindAll<Button>(window, "ReminderBell"));
        window.Close();
    }

    private static async Task<MainWindowViewModel> ShowHomeWithTitleBarAsync(MainWindow window, IServiceProvider services)
    {
        var shell = services.GetRequiredService<MainWindowViewModel>();
        shell.ShowsTitleBar = true;
        window.DataContext = shell;
        window.Show();
        await shell.GoHomeAsync();
        Dispatcher.UIThread.RunJobs();
        return shell;
    }

    private static async Task ClickAndWaitForPageAsync<TPage>(MainWindow window, MainWindowViewModel shell, string automationId)
    {
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, automationId));
        await HeadlessInput.WaitUntilAsync(() => shell.CurrentPage is TPage);
        Dispatcher.UIThread.RunJobs();
    }

    private static bool IsShown(AppSettingsView view, string automationId)
    {
        return HeadlessInput.FindAll<Control>(view, automationId).Count == 1;
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