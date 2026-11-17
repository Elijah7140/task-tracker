using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using TaskTracker.Core;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Reminders;
using TaskTracker.Core.SavedSearches;
using TaskTracker.Core.Search.Syntax;
using TaskTracker.Core.Settings;
using TaskTracker.Core.Transfer;
using TaskTracker.Core.Trash;
using TaskTracker.Core.Undo;
using TaskTracker.Infrastructure;
using TaskTracker.Infrastructure.Persistence;

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
        collection.AddSingleton<IDatabaseBackup>(Backup);
        services = collection.BuildServiceProvider();
    }

    public CountingDatabaseBackup Backup { get; } = new();

    public DataTransferService Transfer => services.GetRequiredService<DataTransferService>();

    public ProjectService Projects => services.GetRequiredService<ProjectService>();

    public FolderService Folders => services.GetRequiredService<FolderService>();

    public UndoHistory History => services.GetRequiredService<UndoHistory>();

    public TrashService Trash => services.GetRequiredService<TrashService>();

    public ReminderService Reminders => services.GetRequiredService<ReminderService>();

    public DataSaved Saves => services.GetRequiredService<DataSaved>();

    public ItemService Items => services.GetRequiredService<ItemService>();

    /// <summary>An item service whose changes are not recorded in the undo history, to simulate changes made behind its back.</summary>
    public ItemService UnrecordedItems
    {
        get
        {
            var contexts = services.GetRequiredService<IDbContextFactory<TaskTrackerDbContext>>();
            var units = new EfUnitOfWorkFactory(contexts, NullUndoRecorder.Instance);
            return new ItemService(units, TimeProvider.System, TimeZoneInfo.Utc);
        }
    }

    public SettingsService Settings => services.GetRequiredService<SettingsService>();

    public LookupService Lookups => services.GetRequiredService<LookupService>();

    public FieldService Fields => services.GetRequiredService<FieldService>();

    public SavedSearchService SavedSearches => services.GetRequiredService<SavedSearchService>();

    public ItemQueryParser Parser => services.GetRequiredService<ItemQueryParser>();

    public IUnitOfWorkFactory UnitOfWorkFactory => services.GetRequiredService<IUnitOfWorkFactory>();

    public async Task InitializeAsync()
    {
        await services.GetRequiredService<DatabaseInitializer>().InitializeAsync();
    }

    public ValueTask DisposeAsync()
    {
        services.Dispose();
        SqliteConnection.ClearAllPools();
        File.Delete(databasePath);
        return ValueTask.CompletedTask;
    }
}