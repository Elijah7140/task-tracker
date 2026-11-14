using Microsoft.Extensions.DependencyInjection;

using TaskTracker.App.Desktop.Dialogs;
using TaskTracker.App.Desktop.Views;
using TaskTracker.Core;
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
        IDialogService? dialogs = null)
    {
        var services = new ServiceCollection();

        services.AddSingleton(clock ?? TimeProvider.System);
        services.AddSingleton(timeZone ?? TimeZoneInfo.Local);
        services.AddTaskTrackerCore();
        var path = databasePath ?? Environment.GetEnvironmentVariable("TASKTRACKER_DB_PATH") ?? DatabaseInitializer.DefaultPath;
        services.AddTaskTrackerInfrastructure(path);

        // Views are matched to ViewModels explicitly; see ViewLocator.
        services.AddSingleton(_ => new ViewLocator()
            .Register<HomeViewModel, HomeView>()
            .Register<AppSettingsViewModel, AppSettingsView>()
            .Register<ProjectSettingsViewModel, ProjectSettingsView>()
            .Register<ProjectWorkspaceViewModel, ProjectWorkspaceView>()
            .Register<SearchViewModel, SearchView>()
            .Register<CalendarViewModel, CalendarView>());

        services.AddSingleton<MainWindowViewModel>();
        services.AddSingleton<INavigationService>(provider => provider.GetRequiredService<MainWindowViewModel>());
        services.AddSingleton<IDialogService>(dialogs ?? new AvaloniaDialogService());

        return services.BuildServiceProvider(new ServiceProviderOptions
        {
            ValidateOnBuild = true,
            ValidateScopes = true,
        });
    }
}