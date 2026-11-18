using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Calendar;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Reminders;
using TaskTracker.Core.Search;
using TaskTracker.Core.Tickets;
using TaskTracker.Core.Today;
using TaskTracker.Core.Trash;
using TaskTracker.Core.Undo;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>
/// Owns one EF context and its repositories. A save with an undo label also records the changed
/// rows as one undo step; a save without a label records nothing.
/// </summary>
public sealed class EfUnitOfWork : IUnitOfWork
{
    private readonly TaskTrackerDbContext database;
    private readonly IDbContextFactory<TaskTrackerDbContext> contexts;
    private readonly IUndoRecorder recorder;
    private readonly DataSaved? saved;

    /// <param name="database">The context this unit of work owns.</param>
    /// <param name="contexts">Opens the fresh contexts that undo and redo write through.</param>
    /// <param name="recorder">Receives labelled saves; pass <see cref="NullUndoRecorder.Instance"/> for none.</param>
    /// <param name="saved">Signals committed writes to application observers.</param>
    public EfUnitOfWork(TaskTrackerDbContext database, IDbContextFactory<TaskTrackerDbContext> contexts,
        IUndoRecorder recorder, DataSaved? saved = null)
    {
        this.database = database;
        this.contexts = contexts;
        this.recorder = recorder;
        this.saved = saved;
        Projects = new EfProjectRepository(database);
        Folders = new EfFolderRepository(database);
        Items = new EfItemRepository(database);
        Lookups = new EfLookupRepository(database);
        Fields = new EfFieldRepository(database);
        Settings = new EfSettingsStore(database);
        Search = new SqlItemSearch(database);
        Calendar = new EfCalendarRepository(database);
        Tickets = new EfTicketRepository(database);
        Today = new EfTodayRepository(database);
        Trash = new EfTrashRepository(database);
        SavedSearches = new EfSavedSearchRepository(database);
        Reminders = new EfReminderRepository(database);
    }

    public IProjectRepository Projects { get; }

    public IFolderRepository Folders { get; }

    public IItemRepository Items { get; }

    public ILookupRepository Lookups { get; }

    public IFieldRepository Fields { get; }

    public ISettingsStore Settings { get; }

    public IItemSearch Search { get; }

    public ICalendarRepository Calendar { get; }

    public ITicketRepository Tickets { get; }

    public ITodayRepository Today { get; }

    public ITrashRepository Trash { get; }

    public ISavedSearchRepository SavedSearches { get; }

    public IReminderRepository Reminders { get; }

    public async Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        var settingsChanged = HasGlobalSettingChanges();
        if (await database.SaveChangesAsync(cancellationToken) > 0)
        {
            saved?.Publish(settingsChanged);
        }
    }

    public Task SaveChangesAsync(string undoLabel, CancellationToken cancellationToken)
    {
        return SaveChangesAsync(undoLabel, [], cancellationToken);
    }

    public async Task SaveChangesAsync(string undoLabel, IReadOnlyList<Guid> autoCompletionEnabledProjects,
        CancellationToken cancellationToken)
    {
        var rows = UndoRowCollector.Collect(database.ChangeTracker);
        var settingsChanged = HasGlobalSettingChanges();
        var changed = await database.SaveChangesAsync(cancellationToken);

        if (rows.Count > 0)
        {
            recorder.Record(new EfUndoableChange(contexts, rows, undoLabel, autoCompletionEnabledProjects.ToHashSet(), saved));
        }

        if (changed > 0)
        {
            saved?.Publish(settingsChanged);
        }
    }

    private bool HasGlobalSettingChanges()
    {
        database.ChangeTracker.DetectChanges();
        return database.ChangeTracker.Entries<GlobalSettingRow>()
            .Any(entry => entry.State is EntityState.Added or EntityState.Modified or EntityState.Deleted);
    }

    public ValueTask DisposeAsync()
    {
        return database.DisposeAsync();
    }
}