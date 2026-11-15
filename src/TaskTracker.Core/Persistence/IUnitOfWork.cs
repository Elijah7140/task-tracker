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

    /// <summary>Saves without recording an undo step; settings, lookups, field definitions, saved searches and purges use this.</summary>
    Task SaveChangesAsync(CancellationToken cancellationToken);

    /// <summary>Saves, then records the save as one undo step named by <paramref name="undoLabel"/> (see <c>UndoLabels</c>).</summary>
    Task SaveChangesAsync(string undoLabel, CancellationToken cancellationToken);
}