using TaskTracker.Core.Calendar;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Search;
using TaskTracker.Core.Trash;

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
        Fields = new EfFieldRepository(database);
        Settings = new EfSettingsStore(database);
        Search = new SqlItemSearch(database);
        Calendar = new EfCalendarRepository(database);
        Trash = new EfTrashRepository(database);
    }

    public IProjectRepository Projects { get; }

    public IFolderRepository Folders { get; }

    public IItemRepository Items { get; }

    public ILookupRepository Lookups { get; }

    public IFieldRepository Fields { get; }

    public ISettingsStore Settings { get; }

    public IItemSearch Search { get; }

    public ICalendarRepository Calendar { get; }

    public ITrashRepository Trash { get; }

    public async Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        await database.SaveChangesAsync(cancellationToken);
    }

    public ValueTask DisposeAsync()
    {
        return database.DisposeAsync();
    }
}