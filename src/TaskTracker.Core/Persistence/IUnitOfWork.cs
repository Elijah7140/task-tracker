namespace TaskTracker.Core.Persistence;

/// <summary>Owns repositories sharing one disposable persistence context.</summary>
public interface IUnitOfWork : IAsyncDisposable
{
    IProjectRepository Projects { get; }

    IFolderRepository Folders { get; }

    IItemRepository Items { get; }

    ILookupRepository Lookups { get; }

    ISettingsStore Settings { get; }

    Task SaveChangesAsync(CancellationToken cancellationToken);
}