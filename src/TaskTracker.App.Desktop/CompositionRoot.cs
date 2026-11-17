using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Dialogs;
using TaskTracker.App.Desktop.Views;
using TaskTracker.Core;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Transfer;
using TaskTracker.Infrastructure;
using TaskTracker.Infrastructure.Persistence;
using TaskTracker.Presentation.Navigation;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop;

/// <summary>The one place where the application's object graph is wired together.</summary>
public static class CompositionRoot
{
    /// <summary>Builds application services, allowing deterministic test dependencies.</summary>
    public static ServiceProvider BuildServices(
        TimeProvider? clock = null,
        TimeZoneInfo? timeZone = null,
        string? databasePath = null,
        IDialogService? dialogs = null,
        IFilePickerService? filePicker = null,
        IDatabaseBackup? backup = null,
        ILinkLauncher? linkLauncher = null)
    {
        var services = new ServiceCollection();

        services.AddSingleton(clock ?? TimeProvider.System);
        services.AddSingleton(timeZone ?? TimeZoneInfo.Local);
        services.AddTaskTrackerCore();
        var path = databasePath ?? Environment.GetEnvironmentVariable("TASKTRACKER_DB_PATH") ?? DatabaseInitializer.DefaultPath;
        services.AddTaskTrackerInfrastructure(path);

        if (backup is not null)
        {
            services.AddSingleton(backup);
        }

        // Views are matched to ViewModels explicitly; see ViewLocator.
        services.AddSingleton(_ => new ViewLocator()
            .Register<HomeViewModel, HomeView>()
            .Register<AppSettingsViewModel, AppSettingsView>()
            .Register<ProjectSettingsViewModel, ProjectSettingsView>()
            .Register<ProjectWorkspaceViewModel, ProjectWorkspaceView>()
            .Register<SearchViewModel, SearchView>()
            .Register<CalendarViewModel, CalendarView>()
            .Register<TrashViewModel, TrashView>());

        services.AddSingleton<MainWindowViewModel>();
        services.AddSingleton<INavigationService>(provider => provider.GetRequiredService<MainWindowViewModel>());
        services.AddSingleton<IDialogService>(dialogs ?? new AvaloniaDialogService());
        services.AddSingleton(filePicker ?? CreateFilePicker());
        services.AddSingleton(linkLauncher ?? new AvaloniaLinkLauncher());
        services.AddSingleton(provider => new TransferServices(
            provider.GetRequiredService<DataTransferService>(), provider.GetRequiredService<IFilePickerService>()));

        return services.BuildServiceProvider(new ServiceProviderOptions
        {
            ValidateOnBuild = true,
            ValidateScopes = true,
        });
    }

    /// <summary>
    /// The real file dialogs, except in a test run: only when both TASKTRACKER_TEST_FILE_PATH and
    /// TASKTRACKER_SMOKE=1 are set does every picker answer with that fixed path (see README.md).
    /// </summary>
    private static IFilePickerService CreateFilePicker()
    {
        var testPath = Environment.GetEnvironmentVariable(TestFilePickerService.PathVariable);
        var smokeRun = Environment.GetEnvironmentVariable(TestFilePickerService.SmokeVariable) == "1";

        if (smokeRun && !string.IsNullOrEmpty(testPath))
        {
            return new TestFilePickerService(testPath);
        }

        return new AvaloniaFilePickerService();
    }
}