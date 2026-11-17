#pragma warning disable xUnit1051
using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Trash;
using TaskTracker.Infrastructure.Persistence;
using TaskTracker.Infrastructure.Tests.Persistence;

namespace TaskTracker.Infrastructure.Tests.Trash;

/// <summary>A SQLite store with the services the trash tests use, and helpers that read rows back through fresh contexts.</summary>
internal sealed class TrashTestWorld : IAsyncDisposable
{
    private readonly SqliteTestStore store = new();
    private TaskTrackerDbContext context = null!;

    public ProjectService Projects { get; private set; } = null!;

    public FolderService Folders { get; private set; } = null!;

    public ItemService Items { get; private set; } = null!;

    public TrashService Trash { get; private set; } = null!;

    public SqliteTestStore Store => store;

    public TaskTrackerDbContext Context => context;

    public static async Task<TrashTestWorld> CreateAsync()
    {
        var world = new TrashTestWorld();
        await world.store.InitializeAsync();
        world.context = world.store.Open();
        world.Projects = world.store.Projects(world.context);
        world.Folders = world.store.Folders(world.context);
        world.Items = world.store.Items(world.context);
        world.Trash = world.store.Trash(world.context);
        return world;
    }

    /// <summary>Moves the fake clock so the next deletion gets a later timestamp.</summary>
    public void Tick()
    {
        store.Clock.Advance(TimeSpan.FromMinutes(1));
    }

    public async Task<TodoItem> ReadItemAsync(Guid id)
    {
        await using var reader = store.Open();
        return await reader.TodoItems.IgnoreQueryFilters().AsNoTracking().SingleAsync(item => item.Id == id);
    }

    public async Task<Folder> ReadFolderAsync(Guid id)
    {
        await using var reader = store.Open();
        return await reader.Folders.IgnoreQueryFilters().AsNoTracking().SingleAsync(folder => folder.Id == id);
    }

    public async Task<Project> ReadProjectAsync(Guid id)
    {
        await using var reader = store.Open();
        return await reader.Projects.IgnoreQueryFilters().AsNoTracking().SingleAsync(project => project.Id == id);
    }

    public async Task<bool> ItemExistsAsync(Guid id)
    {
        await using var reader = store.Open();
        return await reader.TodoItems.IgnoreQueryFilters().AnyAsync(item => item.Id == id);
    }

    public async Task<bool> FolderExistsAsync(Guid id)
    {
        await using var reader = store.Open();
        return await reader.Folders.IgnoreQueryFilters().AnyAsync(folder => folder.Id == id);
    }

    public async Task<bool> ProjectExistsAsync(Guid id)
    {
        await using var reader = store.Open();
        return await reader.Projects.IgnoreQueryFilters().AnyAsync(project => project.Id == id);
    }

    public async Task<int> CountRowsAsync(string table)
    {
        await using var reader = store.Open();
        var sql = "SELECT COUNT(*) AS Value FROM " + table;
#pragma warning disable EF1002 // table names come from the tests themselves
        return await reader.Database.SqlQueryRaw<int>(sql).SingleAsync();
#pragma warning restore EF1002
    }

    public async ValueTask DisposeAsync()
    {
        await context.DisposeAsync();
        await store.DisposeAsync();
    }
}