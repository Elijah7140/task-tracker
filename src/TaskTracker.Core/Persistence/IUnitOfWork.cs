using TaskTracker.Core.Search;

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

    Task SaveChangesAsync(CancellationToken cancellationToken);
}