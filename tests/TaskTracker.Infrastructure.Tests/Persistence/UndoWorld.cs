using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Calendar;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Search;
using TaskTracker.Core.Settings;
using TaskTracker.Core.Transfer;
using TaskTracker.Core.Trash;
using TaskTracker.Core.Undo;
using TaskTracker.Infrastructure.Persistence;

namespace TaskTracker.Infrastructure.Tests.Persistence;

/// <summary>
/// Real services over an in-memory SQLite database whose units of work record into an
/// <see cref="UndoHistory"/>. State is always read through a fresh context.
/// </summary>
internal sealed class UndoWorld : IAsyncDisposable
{
    private readonly SqliteTestStore store = new();

    private UndoWorld()
    {
        History = new UndoHistory();
        Recorder = new RecordingUndoRecorder(History);
    }

    public FakeTimeProvider Clock => store.Clock;

    public UndoHistory History { get; }

    public RecordingUndoRecorder Recorder { get; }

    public Project Project { get; private set; } = null!;

    public ProjectService Projects { get; private set; } = null!;

    public FolderService Folders { get; private set; } = null!;

    public ItemService Items { get; private set; } = null!;

    public FieldService Fields { get; private set; } = null!;

    public SettingsService Settings { get; private set; } = null!;

    public CalendarRescheduleService Rescheduler { get; private set; } = null!;

    public CalendarService CalendarQueries { get; private set; } = null!;

    public TrashService Trash { get; private set; } = null!;

    public ItemSearchService Search { get; private set; } = null!;

    public DataTransferService Transfer { get; private set; } = null!;

    public TaskTrackerDbContext OpenContext()
    {
        return store.Open();
    }

    /// <summary>Creates a world holding one project; creating a project is not an undoable step.</summary>
    public static async Task<UndoWorld> CreateAsync()
    {
        var world = new UndoWorld();
        await world.store.InitializeAsync();
        world.CreateServices();
        world.Project = await world.Projects.CreateAsync("Project");
        return world;
    }

    private void CreateServices()
    {
        var contexts = new StoreContextFactory(store);
        IUnitOfWorkFactory units = new RecordingUnitOfWorkFactory(contexts, Recorder);
        Projects = new ProjectService(units, store.Clock, TimeZoneInfo.Utc);
        Folders = new FolderService(units, store.Clock);
        Items = new ItemService(units, store.Clock, TimeZoneInfo.Utc);
        Fields = new FieldService(units);
        Settings = new SettingsService(units, store.Clock);
        Rescheduler = new CalendarRescheduleService(units, store.Clock);
        CalendarQueries = new CalendarService(units);
        Trash = new TrashService(units, store.Clock);
        Search = new ItemSearchService(units, new ItemQueryValidator(units));
        Transfer = new DataTransferService(units, store.Clock, new TaskTracker.Infrastructure.Tests.Transfer.RecordingDatabaseBackup());
    }

    public async Task<TodoItem> ReadItemAsync(Guid id)
    {
        await using var database = store.Open();
        return await database.TodoItems.IgnoreQueryFilters().AsNoTracking()
            .SingleAsync(item => item.Id == id);
    }

    public async Task<bool> ItemExistsAsync(Guid id)
    {
        await using var database = store.Open();
        return await database.TodoItems.IgnoreQueryFilters().AnyAsync(item => item.Id == id);
    }

    public async Task<Folder> ReadFolderAsync(Guid id)
    {
        await using var database = store.Open();
        return await database.Folders.IgnoreQueryFilters().AsNoTracking().SingleAsync(folder => folder.Id == id);
    }

    public async Task<Project> ReadProjectAsync(Guid id)
    {
        await using var database = store.Open();
        return await database.Projects.IgnoreQueryFilters().AsNoTracking().SingleAsync(project => project.Id == id);
    }

    public async Task<List<ItemFieldValue>> ReadFieldValuesAsync(Guid itemId)
    {
        await using var database = store.Open();
        return await database.ItemFieldValues.AsNoTracking().Where(value => value.ItemId == itemId).ToListAsync();
    }

    /// <summary>Every item, folder and project row, deleted ones included, as comparable text.</summary>
    public async Task<string> SnapshotAsync()
    {
        await using var database = store.Open();
        var lines = new List<string>();
        var items = await database.TodoItems.IgnoreQueryFilters().AsNoTracking().OrderBy(item => item.Id).ToListAsync();
        var folders = await database.Folders.IgnoreQueryFilters().AsNoTracking().OrderBy(folder => folder.Id).ToListAsync();
        var projects = await database.Projects.IgnoreQueryFilters().AsNoTracking().OrderBy(project => project.Id).ToListAsync();

        foreach (var item in items)
        {
            lines.Add($"item {item.Id} {item.Title} {item.Description} {item.FolderId} {item.ParentItemId} " +
                $"{item.SortOrder} {item.DueDate} {item.DueTime} {item.ScheduledStart:O} {item.ScheduledEnd:O} " +
                $"{item.CompletedAtUtc:O} {item.DeletedAtUtc:O} {item.DeletionBatchId} {item.UpdatedAtUtc:O}");
        }

        foreach (var folder in folders)
        {
            lines.Add($"folder {folder.Id} {folder.Name} {folder.ParentFolderId} {folder.SortOrder} " +
                $"{folder.DeletedAtUtc:O} {folder.DeletionBatchId} {folder.UpdatedAtUtc:O}");
        }

        foreach (var project in projects)
        {
            lines.Add($"project {project.Id} {project.Name} {project.SortOrder} " +
                $"{project.DeletedAtUtc:O} {project.DeletionBatchId} {project.UpdatedAtUtc:O}");
        }

        return string.Join(Environment.NewLine, lines);
    }

    /// <summary>Titles of the items matching a full-text query, in result order.</summary>
    public async Task<List<string>> SearchTitlesAsync(string text)
    {
        var query = new ItemQuery(new SearchScope.AllProjects(), text, [], true);
        var results = await Search.SearchAsync(query);
        return results.Items.Select(item => item.Title).ToList();
    }

    public async ValueTask DisposeAsync()
    {
        await store.DisposeAsync();
    }

    public ItemService CreateItemService(IInterceptor interceptor)
    {
        var contexts = new StoreContextFactory(store, interceptor);
        return new ItemService(new RecordingUnitOfWorkFactory(contexts, Recorder), Clock, TimeZoneInfo.Utc);
    }

    private sealed class StoreContextFactory(SqliteTestStore store, IInterceptor? interceptor = null) : IDbContextFactory<TaskTrackerDbContext>
    {
        public TaskTrackerDbContext CreateDbContext()
        {
            return store.Open(interceptor);
        }
    }

    private sealed class RecordingUnitOfWorkFactory(
        IDbContextFactory<TaskTrackerDbContext> contexts,
        IUndoRecorder recorder) : IUnitOfWorkFactory
    {
        public IUnitOfWork Begin()
        {
            return new EfUnitOfWork(contexts.CreateDbContext(), contexts, recorder);
        }
    }
}