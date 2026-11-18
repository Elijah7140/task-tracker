namespace TaskTracker.Core.Fields;

/// <summary>Serializes undo, redo and participating service writes within one application service provider.</summary>
public sealed class FieldWriteGate
{
    private readonly SemaphoreSlim semaphore = new(1, 1);

    /// <summary>Shared gate for callers that construct services outside dependency injection.</summary>
    public static FieldWriteGate Shared { get; } = new();

    public async Task<IDisposable> EnterAsync(CancellationToken cancellationToken = default)
    {
        await semaphore.WaitAsync(cancellationToken);
        return new Lease(semaphore);
    }

    private sealed class Lease(SemaphoreSlim semaphore) : IDisposable
    {
        public void Dispose()
        {
            semaphore.Release();
        }
    }
}