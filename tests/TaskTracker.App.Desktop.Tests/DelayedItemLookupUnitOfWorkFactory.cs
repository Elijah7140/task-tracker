using TaskTracker.Core.Calendar;
using TaskTracker.Core.Items;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Search;
using TaskTracker.Core.Trash;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>
/// Wraps a real unit-of-work factory. After <see cref="Hold"/>, single-item lookups wait until
/// <see cref="Release"/>, so a test can act while an item location lookup is still in flight.
/// </summary>
internal sealed class DelayedItemLookupUnitOfWorkFactory(IUnitOfWorkFactory inner) : IUnitOfWorkFactory
{
    private TaskCompletionSource? gate;

    /// <summary>The number of lookups that have started since <see cref="Hold"/>.</summary>
    public int LookupsStarted { get; private set; }

    /// <summary>The number of lookups that have finished since <see cref="Hold"/>.</summary>
    public int LookupsFinished { get; private set; }

    public void Hold()
    {
        LookupsStarted = 0;
        LookupsFinished = 0;
        gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    }

    public void Release()
    {
        gate?.SetResult();
    }

    public IUnitOfWork Begin()
    {
        return new DelayedUnitOfWork(inner.Begin(), this);
    }

    private async Task<TodoItem?> FindAsync(IItemRepository items, Guid id, CancellationToken cancellationToken)
    {
        var currentGate = gate;

        if (currentGate is null)
        {
            return await items.FindAsync(id, cancellationToken);
        }

        LookupsStarted++;
        await currentGate.Task;
        var item = await items.FindAsync(id, cancellationToken);
        LookupsFinished++;
        return item;
    }

    private sealed class DelayedUnitOfWork(IUnitOfWork unit, DelayedItemLookupUnitOfWorkFactory owner) : IUnitOfWork
    {
        public IProjectRepository Projects => unit.Projects;

        public IFolderRepository Folders => unit.Folders;

        public IItemRepository Items => new DelayedItemRepository(unit.Items, owner);

        public ILookupRepository Lookups => unit.Lookups;

        public IFieldRepository Fields => unit.Fields;

        public ISettingsStore Settings => unit.Settings;

        public IItemSearch Search => unit.Search;

        public ICalendarRepository Calendar => unit.Calendar;

        public ITrashRepository Trash => unit.Trash;


        public ISavedSearchRepository SavedSearches => unit.SavedSearches;

        public Task SaveChangesAsync(CancellationToken cancellationToken)
        {
            return unit.SaveChangesAsync(cancellationToken);
        }

        public ValueTask DisposeAsync()
        {
            return unit.DisposeAsync();
        }
    }

    private sealed class DelayedItemRepository(IItemRepository items, DelayedItemLookupUnitOfWorkFactory owner)
        : IItemRepository
    {
        public Task<IReadOnlyList<TodoItem>> LoadAreaAsync(
            Guid projectId, Guid? folderId, CancellationToken cancellationToken)
        {
            return items.LoadAreaAsync(projectId, folderId, cancellationToken);
        }

        public Task<IReadOnlyList<TodoItem>> LoadProjectAsync(Guid projectId, CancellationToken cancellationToken)
        {
            return items.LoadProjectAsync(projectId, cancellationToken);
        }

        public Task<TodoItem?> FindAsync(Guid id, CancellationToken cancellationToken)
        {
            return owner.FindAsync(items, id, cancellationToken);
        }

        public void Add(TodoItem item)
        {
            items.Add(item);
        }
    }
}