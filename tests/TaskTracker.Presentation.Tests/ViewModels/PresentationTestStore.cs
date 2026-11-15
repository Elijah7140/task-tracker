using Microsoft.Extensions.DependencyInjection;

using TaskTracker.Core;
using TaskTracker.Core.Projects;
using TaskTracker.Infrastructure;
using TaskTracker.Infrastructure.Persistence;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.Tests.ViewModels;

internal sealed class PresentationTestStore : IAsyncDisposable
{
    private readonly string databasePath = Path.Combine(Path.GetTempPath(), $"tasktracker-vm-{Guid.CreateVersion7()}.db");
    private readonly ServiceProvider services;

    public PresentationTestStore(TimeProvider? clock = null, TimeZoneInfo? timeZone = null)
    {
        var collection = new ServiceCollection();
        collection.AddSingleton(clock ?? TimeProvider.System);
        collection.AddSingleton(timeZone ?? TimeZoneInfo.Utc);
        collection.AddTaskTrackerCore();
        collection.AddTaskTrackerInfrastructure(databasePath);
        services = collection.BuildServiceProvider();
    }

    public ProjectService Projects => services.GetRequiredService<ProjectService>();

    public FolderService Folders => services.GetRequiredService<FolderService>();

    public TaskTracker.Core.Trash.TrashService Trash =>
        services.GetRequiredService<TaskTracker.Core.Trash.TrashService>();

    public TaskTracker.Core.Items.ItemService Items => services.GetRequiredService<TaskTracker.Core.Items.ItemService>();

    public TaskTracker.Core.Settings.SettingsService Settings =>
        services.GetRequiredService<TaskTracker.Core.Settings.SettingsService>();

    public TaskTracker.Core.Lookups.LookupService Lookups =>
        services.GetRequiredService<TaskTracker.Core.Lookups.LookupService>();

    public TaskTracker.Core.Fields.FieldService Fields =>
        services.GetRequiredService<TaskTracker.Core.Fields.FieldService>();

    public TaskTracker.Core.Persistence.IUnitOfWorkFactory UnitOfWorkFactory =>
        services.GetRequiredService<TaskTracker.Core.Persistence.IUnitOfWorkFactory>();

    public async Task InitializeAsync()
    {
        await services.GetRequiredService<DatabaseInitializer>().InitializeAsync();
    }

    public ValueTask DisposeAsync()
    {
        services.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(databasePath);
        return ValueTask.CompletedTask;
    }
}