namespace TaskTracker.Core.Trash;

/// <summary>Lists deletion batches and restores or permanently removes them, for presentation clients.</summary>
public interface ITrashService
{
    /// <summary>Lists the batches in scope, newest deletion first.</summary>
    Task<IReadOnlyList<TrashBatch>> ListAsync(TrashScope scope, CancellationToken cancellationToken = default);

    /// <summary>Restores exactly the rows of one batch.</summary>
    Task RestoreAsync(Guid batchId, CancellationToken cancellationToken = default);

    /// <summary>Permanently removes one batch.</summary>
    Task PurgeAsync(Guid batchId, CancellationToken cancellationToken = default);

    /// <summary>Permanently removes every deleted row in scope.</summary>
    Task EmptyAsync(TrashScope scope, CancellationToken cancellationToken = default);
}