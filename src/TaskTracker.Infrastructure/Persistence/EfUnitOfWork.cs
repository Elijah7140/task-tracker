using TaskTracker.Core.Persistence;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>Owns one EF context and its repositories.</summary>
public sealed class EfUnitOfWork : IUnitOfWork
{
    private readonly TaskTrackerDbContext database;

    public EfUnitOfWork(TaskTrackerDbContext database)
    {
        this.database = database;
        Projects = new EfProjectRepository(database);
        Folders = new EfFolderRepository(database);
        Items = new EfItemRepository(database);
        Lookups = new EfLookupRepository(database);
        Settings = new EfSettingsStore(database);
    }

    public IProjectRepository Projects { get; }

    public IFolderRepository Folders { get; }

    public IItemRepository Items { get; }

    public ILookupRepository Lookups { get; }

    public ISettingsStore Settings { get; }

    public async Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        await database.SaveChangesAsync(cancellationToken);
    }

    public ValueTask DisposeAsync()
    {
        return database.DisposeAsync();
    }
}