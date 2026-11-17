using TaskTracker.Core.Calendar;
using TaskTracker.Core.Items;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Search;
using TaskTracker.Core.Trash;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>
/// Wraps a real unit-of-work factory but holds every trash listing until the test opens the gate,
/// so a test can navigate while the trash is still loading.
/// </summary>
internal sealed class GatedTrashUnitOfWorkFactory(IUnitOfWorkFactory inner) : IUnitOfWorkFactory
{
    private readonly TaskCompletionSource gate = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public void OpenGate()
    {
        gate.TrySetResult();
    }

    public IUnitOfWork Begin()
    {
        return new GatedUnitOfWork(inner.Begin(), gate.Task);
    }

    private sealed class GatedUnitOfWork(IUnitOfWork unit, Task gate) : IUnitOfWork
    {
        public IProjectRepository Projects => unit.Projects;

        public IFolderRepository Folders => unit.Folders;

        public IItemRepository Items => unit.Items;

        public ILookupRepository Lookups => unit.Lookups;

        public IFieldRepository Fields => unit.Fields;

        public ISettingsStore Settings => unit.Settings;

        public IItemSearch Search => unit.Search;

        public ICalendarRepository Calendar => unit.Calendar;

        public ITrashRepository Trash => new GatedTrashRepository(unit.Trash, gate);


        public TaskTracker.Core.Reminders.IReminderRepository Reminders => unit.Reminders;

        public ISavedSearchRepository SavedSearches => unit.SavedSearches;

        public Task SaveChangesAsync(CancellationToken cancellationToken)
        {
            return unit.SaveChangesAsync(cancellationToken);
        }

        public Task SaveChangesAsync(string undoLabel, CancellationToken cancellationToken)
        {
            return unit.SaveChangesAsync(undoLabel, cancellationToken);
        }

        public ValueTask DisposeAsync()
        {
            return unit.DisposeAsync();
        }
    }

    private sealed class GatedTrashRepository(ITrashRepository repository, Task gate) : ITrashRepository
    {
        public async Task<IReadOnlyList<Guid>> ListProjectIdsWithDeletionsAsync(Guid? projectId,
            CancellationToken cancellationToken)
        {
            await gate;
            return await repository.ListProjectIdsWithDeletionsAsync(projectId, cancellationToken);
        }

        public Task<Guid?> FindProjectIdAsync(Guid batchId, CancellationToken cancellationToken)
        {
            return repository.FindProjectIdAsync(batchId, cancellationToken);
        }

        public void Remove(Project project)
        {
            repository.Remove(project);
        }

        public void Remove(Folder folder)
        {
            repository.Remove(folder);
        }

        public void Remove(TodoItem item)
        {
            repository.Remove(item);
        }

        public Task RemoveProjectOwnedDataAsync(Guid projectId, CancellationToken cancellationToken)
        {
            return repository.RemoveProjectOwnedDataAsync(projectId, cancellationToken);
        }
    }
}