#pragma warning disable xUnit1051
using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
using TaskTracker.Core.SavedSearches;
using TaskTracker.Core.Settings;
using TaskTracker.Core.Transfer;
using TaskTracker.Infrastructure.Persistence;
using TaskTracker.Infrastructure.Tests.Persistence;

namespace TaskTracker.Infrastructure.Tests.Transfer;

/// <summary>A fresh SQLite database with every service the transfer tests use, and a recording backup.</summary>
internal sealed class TransferWorld : IAsyncDisposable
{
    private readonly SqliteTestStore store = new();
    private TaskTrackerDbContext context = null!;

    public RecordingDatabaseBackup Backup { get; } = new();

    public DataTransferService Transfer { get; private set; } = null!;

    public ProjectService Projects { get; private set; } = null!;

    public FolderService Folders { get; private set; } = null!;

    public ItemService Items { get; private set; } = null!;

    public LookupService Lookups { get; private set; } = null!;

    public FieldService Fields { get; private set; } = null!;

    public SettingsService Settings { get; private set; } = null!;

    public SavedSearchService SavedSearches { get; private set; } = null!;

    public SqliteTestStore Store => store;

    public static async Task<TransferWorld> CreateAsync()
    {
        var world = new TransferWorld();
        await world.store.InitializeAsync();
        world.context = world.store.Open();
        world.Transfer = new DataTransferService(
            new TestUnitOfWorkFactory(world.context), world.store.Clock, world.Backup);
        world.Projects = world.store.Projects(world.context);
        world.Folders = world.store.Folders(world.context);
        world.Items = world.store.Items(world.context);
        world.Lookups = world.store.Lookups(world.context);
        world.Fields = world.store.Fields(world.context);
        world.Settings = world.store.Settings(world.context);
        world.SavedSearches = world.store.SavedSearches(world.context);
        return world;
    }

    /// <summary>Counts every table through a fresh context, so cached tracking cannot hide a difference.</summary>
    public async Task<TransferRowCounts> CountRowsAsync()
    {
        await using var reader = store.Open();

        return new TransferRowCounts(
            await reader.Projects.IgnoreQueryFilters().CountAsync(),
            await reader.Folders.IgnoreQueryFilters().CountAsync(),
            await reader.TodoItems.IgnoreQueryFilters().CountAsync(),
            await reader.ItemTypes.CountAsync(),
            await reader.PriorityLevels.CountAsync(),
            await reader.FieldDefinitions.CountAsync(),
            await reader.FieldChoices.CountAsync(),
            await reader.ItemFieldValues.CountAsync(),
            await reader.SavedSearches.CountAsync(),
            await reader.ProjectSettings.CountAsync());
    }

    /// <summary>Reads every item of a project, deleted ones included.</summary>
    public async Task<List<TodoItem>> ReadItemsAsync(Guid projectId)
    {
        await using var reader = store.Open();

        return await reader.TodoItems.IgnoreQueryFilters().AsNoTracking()
            .Where(item => item.ProjectId == projectId).OrderBy(item => item.SortOrder).ToListAsync();
    }

    public async Task<List<Project>> ReadProjectsAsync()
    {
        await using var reader = store.Open();

        return await reader.Projects.AsNoTracking().OrderBy(project => project.SortOrder).ToListAsync();
    }

    public async Task<List<ItemFieldValue>> ReadValuesAsync(Guid itemId)
    {
        await using var reader = store.Open();

        return await reader.ItemFieldValues.AsNoTracking().Where(value => value.ItemId == itemId).ToListAsync();
    }

    public async Task<List<FieldDefinition>> ReadFieldsAsync()
    {
        await using var reader = store.Open();

        return await reader.FieldDefinitions.AsNoTracking().OrderBy(field => field.SortOrder).ToListAsync();
    }

    public async Task<List<FieldChoice>> ReadChoicesAsync(Guid fieldId)
    {
        await using var reader = store.Open();

        return await reader.FieldChoices.AsNoTracking().Where(choice => choice.FieldDefinitionId == fieldId)
            .OrderBy(choice => choice.SortOrder).ToListAsync();
    }

    public async Task<IReadOnlyList<SavedSearch>> ReadSavedSearchesAsync()
    {
        return await SavedSearches.ListAsync();
    }

    public async Task<EffectiveSettings> ReadEffectiveSettingsAsync(Guid projectId)
    {
        return await Settings.GetEffectiveAsync(projectId);
    }

    public async ValueTask DisposeAsync()
    {
        await context.DisposeAsync();
        await store.DisposeAsync();
    }
}