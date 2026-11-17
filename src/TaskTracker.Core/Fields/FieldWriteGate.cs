namespace TaskTracker.Core.Fields;

/// <summary>Serializes field and item service writes within one application process.</summary>
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