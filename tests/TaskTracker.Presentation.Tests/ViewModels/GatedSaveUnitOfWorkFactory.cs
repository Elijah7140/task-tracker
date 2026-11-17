using TaskTracker.Core.Calendar;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Search;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>
/// Wraps a real unit-of-work factory and, when asked, holds the next save until the test releases
/// it, so a test can act while an item move is still being saved.
/// </summary>
internal sealed class GatedSaveUnitOfWorkFactory(IUnitOfWorkFactory inner) : IUnitOfWorkFactory
{
    private TaskCompletionSource? saveReached;
    private TaskCompletionSource? release;
    private TaskCompletionSource? armed;

    /// <summary>Holds the next save. Call before starting the operation under test.</summary>
    public void HoldNextSave()
    {
        saveReached = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        armed = release;
    }

    /// <summary>Completes when the held save has been requested.</summary>
    public Task WaitForHeldSaveAsync()
    {
        return saveReached!.Task.WaitAsync(TimeSpan.FromSeconds(10));
    }

    public void ReleaseHeldSave()
    {
        release!.SetResult();
    }

    public IUnitOfWork Begin()
    {
        return new GatedUnitOfWork(inner.Begin(), this);
    }

    private async Task HoldIfRequestedAsync()
    {
        var held = armed;

        if (held is null)
        {
            return;
        }

        armed = null;
        saveReached!.SetResult();
        await held.Task;
    }

    private sealed class GatedUnitOfWork(IUnitOfWork unit, GatedSaveUnitOfWorkFactory owner) : IUnitOfWork
    {
        public IProjectRepository Projects => unit.Projects;

        public IFolderRepository Folders => unit.Folders;

        public IItemRepository Items => unit.Items;

        public ILookupRepository Lookups => unit.Lookups;

        public IFieldRepository Fields => unit.Fields;

        public ISettingsStore Settings => unit.Settings;

        public IItemSearch Search => unit.Search;

        public ICalendarRepository Calendar => unit.Calendar;

        public async Task SaveChangesAsync(CancellationToken cancellationToken)
        {
            await owner.HoldIfRequestedAsync();
            await unit.SaveChangesAsync(cancellationToken);
        }

        public ValueTask DisposeAsync()
        {
            return unit.DisposeAsync();
        }
    }
}