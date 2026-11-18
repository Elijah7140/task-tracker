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

    [AvaloniaFact]
    public async Task Saving_reminder_overrides_persists_the_offset_and_time_chosen_in_the_view()
    {
        var window = new MainWindow();
        using var services = await TestServices.CreateAsync(window);
        var project = await services.GetRequiredService<ProjectService>().CreateAsync("Billing");
        var settings = services.GetRequiredService<SettingsService>();
        var shell = services.GetRequiredService<MainWindowViewModel>();
        window.DataContext = shell;
        window.Show();
        await shell.OpenProjectSettingsAsync(project.Id);
        Dispatcher.UIThread.RunJobs();
        var page = Assert.IsType<ProjectSettingsViewModel>(shell.CurrentPage);
        var offset = HeadlessInput.Find<ComboBox>(window, "ProjectReminderOffset");
        var time = HeadlessInput.Find<TimePicker>(window, "ProjectDateOnlyReminderTime");
        Assert.False(offset.IsEffectivelyEnabled);
        Assert.False(time.IsEffectivelyEnabled);

        HeadlessInput.Click(window, HeadlessInput.Find<CheckBox>(window, "ProjectReminderOffsetOverride"));
        HeadlessInput.Click(window, HeadlessInput.Find<CheckBox>(window, "ProjectDateOnlyReminderTimeOverride"));
        HeadlessInput.ChooseItem(window, offset, "2 days before");
        HeadlessInput.AdvanceTimePickerHour(window, time);
        HeadlessInput.Click(window, HeadlessInput.Find<Button>(window, "ProjectSettingsSaveButton"));
        await HeadlessInput.WaitUntilAsync(() => !page.IsDirty);

        var effective = await settings.GetEffectiveAsync(project.Id);
        Assert.Equal(SettingSource.Project, effective.DefaultReminderOffset.Source);
        Assert.Equal(TimeSpan.FromDays(2), effective.DefaultReminderOffset.Value);
        Assert.Equal(SettingSource.Project, effective.DateOnlyReminderTime.Source);
        Assert.Equal(new TimeOnly(10, 0), effective.DateOnlyReminderTime.Value);
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