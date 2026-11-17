using TaskTracker.Core.Trash;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>An in-memory trash. Lists can be held until a test completes them, and changes can be made to fail.</summary>
internal sealed class FakeTrashService : ITrashService
{
    public List<TrashBatch> Batches { get; } = [];

    public List<TrashScope> ListedScopes { get; } = [];

    public List<CancellationToken> ListTokens { get; } = [];

    public List<Guid> Restored { get; } = [];

    public List<Guid> Purged { get; } = [];

    public List<TrashScope> Emptied { get; } = [];

    /// <summary>When true, every list call waits until the test completes it with CompleteList.</summary>
    public bool HoldLists { get; set; }

    /// <summary>When set, a restore records itself and then waits until the test completes this source.</summary>
    public TaskCompletionSource? RestoreGate { get; set; }

    /// <summary>Thrown by the next restore, purge or empty call, then cleared.</summary>
    public Exception? NextFailure { get; set; }

    private List<PendingList> PendingLists { get; } = [];

    public async Task<IReadOnlyList<TrashBatch>> ListAsync(TrashScope scope, CancellationToken cancellationToken = default)
    {
        ListedScopes.Add(scope);
        ListTokens.Add(cancellationToken);

        if (!HoldLists)
        {
            return InScope(scope);
        }

        var pending = new PendingList(InScope(scope));
        PendingLists.Add(pending);
        return await pending.Completion.Task;
    }

    public async Task RestoreAsync(Guid batchId, CancellationToken cancellationToken = default)
    {
        ThrowPendingFailure();
        Restored.Add(batchId);
        Batches.RemoveAll(batch => batch.BatchId == batchId);

        if (RestoreGate is not null)
        {
            await RestoreGate.Task;
        }
    }

    public Task PurgeAsync(Guid batchId, CancellationToken cancellationToken = default)
    {
        ThrowPendingFailure();
        Purged.Add(batchId);
        Batches.RemoveAll(batch => batch.BatchId == batchId);
        return Task.CompletedTask;
    }

    public Task EmptyAsync(TrashScope scope, CancellationToken cancellationToken = default)
    {
        ThrowPendingFailure();
        Emptied.Add(scope);
        Batches.RemoveAll(batch => scope.ProjectId is null || batch.ProjectId == scope.ProjectId);
        return Task.CompletedTask;
    }

    /// <summary>Finishes a held list call, giving it the batches it saw when it started.</summary>
    public void CompleteList(int index)
    {
        PendingLists[index].Completion.SetResult(PendingLists[index].Result);
    }

    /// <summary>Finishes a held list call with the given batches instead.</summary>
    public void CompleteList(int index, IReadOnlyList<TrashBatch> result)
    {
        PendingLists[index].Completion.SetResult(result);
    }

    public void FailList(int index, Exception failure)
    {
        PendingLists[index].Completion.SetException(failure);
    }

    private IReadOnlyList<TrashBatch> InScope(TrashScope scope)
    {
        return Batches.Where(batch => scope.ProjectId is null || batch.ProjectId == scope.ProjectId).ToArray();
    }

    private void ThrowPendingFailure()
    {
        if (NextFailure is null)
        {
            return;
        }

        var failure = NextFailure;
        NextFailure = null;
        throw failure;
    }

    private sealed class PendingList(IReadOnlyList<TrashBatch> result)
    {
        public IReadOnlyList<TrashBatch> Result { get; } = result;

        public TaskCompletionSource<IReadOnlyList<TrashBatch>> Completion { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
    }
}