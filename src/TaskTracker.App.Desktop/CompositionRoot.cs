using Microsoft.Extensions.DependencyInjection;

using TaskTracker.Core;
using TaskTracker.Infrastructure;
using TaskTracker.Infrastructure.Persistence;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop;

/// <summary>The one place where the application's object graph is wired together.</summary>
internal static class CompositionRoot
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
        services.AddSingleton(_ => new ViewLocator());

        services.AddSingleton<MainWindowViewModel>();

        return services.BuildServiceProvider(new ServiceProviderOptions
        {
            ValidateOnBuild = true,
            ValidateScopes = true,
        });
    }
}