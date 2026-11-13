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
    public static ServiceProvider BuildServices()
    {
        var services = new ServiceCollection();

        services.AddSingleton(TimeProvider.System);
        services.AddSingleton(TimeZoneInfo.Local);
        services.AddTaskTrackerCore();
        var databasePath = Environment.GetEnvironmentVariable("TASKTRACKER_DB_PATH") ?? DatabaseInitializer.DefaultPath;
        services.AddTaskTrackerInfrastructure(databasePath);

        // Views are matched to ViewModels explicitly; see ViewLocator.
        services.AddSingleton(_ => new ViewLocator()
            .Register<HomeViewModel, HomeView>()
            .Register<AppSettingsViewModel, AppSettingsView>()
            .Register<ProjectSettingsViewModel, ProjectSettingsView>()
            .Register<ProjectWorkspaceViewModel, ProjectWorkspaceView>());

        services.AddSingleton<MainWindowViewModel>();
        services.AddSingleton<INavigationService>(provider => provider.GetRequiredService<MainWindowViewModel>());
        services.AddSingleton<IDialogService, AvaloniaDialogService>();

        return services.BuildServiceProvider(new ServiceProviderOptions
        {
            ValidateOnBuild = true,
            ValidateScopes = true,
        });
    }
}