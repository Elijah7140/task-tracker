using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Dialogs;
using TaskTracker.App.Desktop.Installation;
using TaskTracker.App.Desktop.Reminders;
using TaskTracker.App.Desktop.Views;
using TaskTracker.Core;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Reminders;
using TaskTracker.Core.Transfer;
using TaskTracker.Infrastructure;
using TaskTracker.Infrastructure.Persistence;
using TaskTracker.Presentation.Installation;
using TaskTracker.Presentation.Navigation;
using TaskTracker.Presentation.Reminders;
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
        ILinkLauncher? linkLauncher = null,
        IReminderNotifier? reminderNotifier = null,
        InstallationServices? installation = null)
    {
        var services = new ServiceCollection();

        services.AddSingleton(clock ?? TimeProvider.System);
        services.AddSingleton(timeZone ?? TimeZoneInfo.Local);
        services.AddTaskTrackerCore();
        services.AddTaskTrackerInfrastructure(ResolveDatabasePath(databasePath));

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
            .Register<TrashViewModel, TrashView>()
            .Register<TodayViewModel, TodayView>());

        services.AddSingleton<DesktopReminderNotifier>();
        services.AddSingleton<IReminderNotifier>(provider =>
            reminderNotifier ?? provider.GetRequiredService<DesktopReminderNotifier>());
        services.AddSingleton<ReminderScheduler>(provider => new ReminderScheduler(
            provider.GetRequiredService<ReminderService>(), provider.GetRequiredService<DataSaved>(),
            provider.GetRequiredService<TimeProvider>(), provider.GetRequiredService<IReminderNotifier>(), new AvaloniaUiDispatcher()));
        services.AddSingleton<MainWindowViewModel>();
        services.AddSingleton<INavigationService>(provider => provider.GetRequiredService<MainWindowViewModel>());
        services.AddSingleton<IDialogService>(dialogs ?? new AvaloniaDialogService());
        services.AddSingleton(filePicker ?? CreateFilePicker());
        services.AddSingleton(linkLauncher ?? new AvaloniaLinkLauncher());
        services.AddSingleton(provider => new TransferServices(
            provider.GetRequiredService<DataTransferService>(), provider.GetRequiredService<IFilePickerService>()));
        services.AddSingleton(_ => installation ?? CreateInstallation());

        return services.BuildServiceProvider(new ServiceProviderOptions
        {
            ValidateOnBuild = true,
            ValidateScopes = true,
        });
    }

    /// <summary>The database file: the given path, else TASKTRACKER_DB_PATH, else the default location.</summary>
    public static string ResolveDatabasePath(string? databasePath = null)
    {
        return databasePath ?? Environment.GetEnvironmentVariable("TASKTRACKER_DB_PATH") ?? DatabaseInitializer.DefaultPath;
    }

    /// <summary>The app version, the GitHub Releases update source and this OS's start-with-system entry.</summary>
    private static InstallationServices CreateInstallation()
    {
        var version = AppVersion.FromAssembly(typeof(CompositionRoot).Assembly);
        var updates = new VelopackUpdateService();
        var startup = new StartupRegistration(StartupEntries.ForInstalledApp(updates.IsInstalled));

        return new InstallationServices(version, updates, startup);
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