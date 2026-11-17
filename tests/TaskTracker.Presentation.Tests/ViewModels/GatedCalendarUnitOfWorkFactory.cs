using TaskTracker.Core.Calendar;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Search;
using TaskTracker.Core.Trash;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>
/// Wraps a real unit-of-work factory but holds every calendar query until the test opens the gate,
/// so a test can navigate while a calendar load is still in flight.
/// </summary>
internal sealed class GatedCalendarUnitOfWorkFactory(IUnitOfWorkFactory inner) : IUnitOfWorkFactory
{
    private readonly TaskCompletionSource gate = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public void OpenGate()
    {
        gate.SetResult();
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

        public ICalendarRepository Calendar => new GatedCalendarRepository(unit.Calendar, gate);

        public ITrashRepository Trash => unit.Trash;

        public Task SaveChangesAsync(CancellationToken cancellationToken)
        {
            return unit.SaveChangesAsync(cancellationToken);
        }

        public ValueTask DisposeAsync()
        {
            return unit.DisposeAsync();
        }
    }

    private sealed class GatedCalendarRepository(ICalendarRepository repository, Task gate) : ICalendarRepository
    {
        public async Task<IReadOnlyList<CalendarEntry>> LoadAsync(
            CalendarQuery query, CancellationToken cancellationToken)
        {
            await gate;
            return await repository.LoadAsync(query, cancellationToken);
        }
    }
}