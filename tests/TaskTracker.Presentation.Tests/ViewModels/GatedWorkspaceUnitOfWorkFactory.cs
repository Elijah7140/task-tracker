using TaskTracker.Core.Calendar;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Search;
using TaskTracker.Core.Trash;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>
/// Wraps a real unit-of-work factory and, once closed, holds every folder-tree query (the first step of
/// loading a workspace) until the test opens it, so a test can navigate while a workspace is still loading.
/// </summary>
internal sealed class GatedWorkspaceUnitOfWorkFactory(IUnitOfWorkFactory inner) : IUnitOfWorkFactory
{
    private TaskCompletionSource gate = CreateOpenGate();

    /// <summary>Holds the folder-tree queries that start after this call.</summary>
    public void CloseGate()
    {
        gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    }

    public void OpenGate()
    {
        gate.TrySetResult();
    }

    public IUnitOfWork Begin()
    {
        return new GatedUnitOfWork(inner.Begin(), gate.Task);
    }

    private static TaskCompletionSource CreateOpenGate()
    {
        var open = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        open.SetResult();
        return open;
    }

    private sealed class GatedUnitOfWork(IUnitOfWork unit, Task gate) : IUnitOfWork
    {
        public IProjectRepository Projects => unit.Projects;

        public IFolderRepository Folders => new GatedFolderRepository(unit.Folders, gate);

        public IItemRepository Items => unit.Items;

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

    private sealed class GatedFolderRepository(IFolderRepository folders, Task gate) : IFolderRepository
    {
        public async Task<IReadOnlyList<Folder>> ListAsync(
            Guid projectId, bool includeDeleted, CancellationToken cancellationToken)
        {
            await gate;
            return await folders.ListAsync(projectId, includeDeleted, cancellationToken);
        }

        public void Add(Folder folder)
        {
            folders.Add(folder);
        }
    }
}