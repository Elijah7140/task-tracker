using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Settings;
using TaskTracker.Core.Trash;
using TaskTracker.Infrastructure.Persistence;

namespace TaskTracker.Infrastructure.Tests.Persistence;

internal sealed class SqliteTestStore : IAsyncDisposable
{
    private readonly SqliteConnection connection = new("Data Source=:memory:");

    public FakeTimeProvider Clock { get; } = new(new DateTimeOffset(2026, 11, 13, 12, 0, 0, TimeSpan.Zero));

    public async Task InitializeAsync()
    {
        await connection.OpenAsync();
        await using var database = Open();
        await database.Database.MigrateAsync();
    }

    public TaskTrackerDbContext Open()
    {
        var options = TaskTrackerSqliteOptions.Configure(
            new DbContextOptionsBuilder<TaskTrackerDbContext>(), connection).Options;
        return new TaskTrackerDbContext(options);
    }

    public ProjectService Projects(TaskTrackerDbContext database)
    {
        return new ProjectService(new TestUnitOfWorkFactory(database), Clock, TimeZoneInfo.Utc);
    }

    public FolderService Folders(TaskTrackerDbContext database)
    {
        return new FolderService(new TestUnitOfWorkFactory(database), Clock);
    }

    public ItemService Items(TaskTrackerDbContext database)
    {
        return new ItemService(new TestUnitOfWorkFactory(database), Clock, TimeZoneInfo.Utc);
    }

    public TrashService Trash(TaskTrackerDbContext database)
    {
        return new TrashService(new TestUnitOfWorkFactory(database), Clock);
    }

    public LookupService Lookups(TaskTrackerDbContext database)
    {
        return new LookupService(new TestUnitOfWorkFactory(database));
    }

    public FieldService Fields(TaskTrackerDbContext database)
    {
        return new FieldService(new TestUnitOfWorkFactory(database));
    }

    public SettingsService Settings(TaskTrackerDbContext database)
    {
        return new SettingsService(new TestUnitOfWorkFactory(database), Clock);
    }

    public async ValueTask DisposeAsync()
    {
        await connection.DisposeAsync();
    }
}