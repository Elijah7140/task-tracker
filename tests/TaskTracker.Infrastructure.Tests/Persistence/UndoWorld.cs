using System.Text.Json;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core;
using TaskTracker.Core.Calendar;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Reminders;
using TaskTracker.Core.SavedSearches;
using TaskTracker.Core.Search;
using TaskTracker.Core.Settings;
using TaskTracker.Core.Tickets;
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

    public LookupService Lookups { get; private set; } = null!;

    public FieldService Fields { get; private set; } = null!;

    public SettingsService Settings { get; private set; } = null!;

    public CalendarRescheduleService Rescheduler { get; private set; } = null!;

    public CalendarService CalendarQueries { get; private set; } = null!;

    public TicketService Tickets { get; private set; } = null!;

    public TrashService Trash { get; private set; } = null!;

    public ReminderService Reminders { get; private set; } = null!;

    public SavedSearchService SavedSearches { get; private set; } = null!;

    public ItemSearchService Search { get; private set; } = null!;

    public DataTransferService Transfer { get; private set; } = null!;

    public TaskTrackerDbContext OpenContext()
    {
        return store.Open();
    }

    /// <summary>Creates a world holding one project with an empty undo history.</summary>
    public static async Task<UndoWorld> CreateAsync(IInterceptor? interceptor = null)
    {
        var world = new UndoWorld();
        await world.store.InitializeAsync();
        world.CreateServices(interceptor);
        var setupProjects = new ProjectService(new RecordingUnitOfWorkFactory(
            new StoreContextFactory(world.store), NullUndoRecorder.Instance), world.Clock, TimeZoneInfo.Utc);
        world.Project = await setupProjects.CreateAsync("Project");
        return world;
    }

    private void CreateServices(IInterceptor? interceptor)
    {
        var contexts = new StoreContextFactory(store, interceptor);
        IUnitOfWorkFactory units = new RecordingUnitOfWorkFactory(contexts, Recorder);
        Projects = new ProjectService(units, store.Clock, TimeZoneInfo.Utc);
        Folders = new FolderService(units, store.Clock);
        Items = new ItemService(units, store.Clock, TimeZoneInfo.Utc);
        Fields = new FieldService(units);
        Lookups = new LookupService(units);
        Settings = new SettingsService(units, store.Clock);
        SavedSearches = new SavedSearchService(units, store.Clock);
        Reminders = new ReminderService(units, store.Clock, TimeZoneInfo.Utc);
        Rescheduler = new CalendarRescheduleService(units, store.Clock);
        CalendarQueries = new CalendarService(units);
        Tickets = new TicketService(units, store.Clock);
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

    /// <summary>Every column in the branch and its owned data, including soft-deleted rows.</summary>
    public Task<string> SnapshotAsync()
    {
        return SnapshotTablesAsync(["Project", "Folder", "TodoItem", "ItemLink", "ItemFieldValue", "ProjectSetting"]);
    }

    /// <summary>Compares every SQLite column before the action, after undo, and after redo.</summary>
    public async Task VerifyRoundTripAsync(Func<Task> action, params string[] tables)
    {
        var before = await SnapshotTablesAsync(tables);
        var stepsBefore = Recorder.Descriptions.Count;
        Clock.Advance(TimeSpan.FromMinutes(1));
        await action();
        var after = await SnapshotTablesAsync(tables);

        Assert.NotEqual(before, after);
        Assert.Equal(stepsBefore + 1, Recorder.Descriptions.Count);
        await History.UndoAsync();
        Assert.Equal(before, await SnapshotTablesAsync(tables));
        await History.RedoAsync();
        Assert.Equal(after, await SnapshotTablesAsync(tables));
    }

    public async Task<string> VerifyRefusalAsync(string externalSql, bool redo, params string[] tables)
    {
        await using var database = OpenContext();
        Assert.True(await database.Database.ExecuteSqlRawAsync(externalSql) > 0);
        var before = await SnapshotTablesAsync(tables);
        var undoDescription = History.UndoDescription;
        var redoDescription = History.RedoDescription;

        var error = await Assert.ThrowsAsync<DomainRuleException>(() => redo ? History.RedoAsync() : History.UndoAsync());

        Assert.Equal(before, await SnapshotTablesAsync(tables));
        Assert.Equal(undoDescription, History.UndoDescription);
        Assert.Equal(redoDescription, History.RedoDescription);
        return error.Message;
    }

    public async Task<string> SnapshotTablesAsync(IEnumerable<string> tables)
    {
        await using var database = OpenContext();
        var snapshots = new List<string>();

        foreach (var table in tables)
        {
            using var command = database.Database.GetDbConnection().CreateCommand();
            command.CommandText = $"SELECT * FROM [{table}]";
            using var reader = await command.ExecuteReaderAsync();
            var rows = new List<string>();
            while (await reader.ReadAsync())
            {
                var values = new object[reader.FieldCount];
                reader.GetValues(values);
                rows.Add(JsonSerializer.Serialize(values));
            }

            snapshots.AddRange(rows.Order(StringComparer.Ordinal).Select(row => $"{table}: {row}"));
        }

        return string.Join(Environment.NewLine, snapshots);
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