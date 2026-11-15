using TaskTracker.Core.Calendar;
using TaskTracker.Core.Search;
using TaskTracker.Core.Trash;

namespace TaskTracker.Core.Persistence;

/// <summary>Owns repositories sharing one disposable persistence context.</summary>
public interface IUnitOfWork : IAsyncDisposable
{
    IProjectRepository Projects { get; }

    IFolderRepository Folders { get; }

    IItemRepository Items { get; }

    ILookupRepository Lookups { get; }

    IFieldRepository Fields { get; }

    ISettingsStore Settings { get; }

    IItemSearch Search { get; }

    ICalendarRepository Calendar { get; }

    ITrashRepository Trash { get; }

    ISavedSearchRepository SavedSearches { get; }

    Task SaveChangesAsync(CancellationToken cancellationToken);
}