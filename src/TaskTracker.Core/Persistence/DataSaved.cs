namespace TaskTracker.Core.Persistence;

/// <summary>Signals committed application writes, including undo and redo.</summary>
public sealed class DataSaved
{
    private long revision;

    /// <summary>Advances on every published commit so readers can detect changes across awaits.</summary>
    public long Revision => Interlocked.Read(ref revision);

    public event Action? Committed;

    /// <summary>Raised after <see cref="Committed"/> when the commit changed a global setting.</summary>
    public event Action? GlobalSettingsCommitted;

    public void Publish(bool globalSettingsChanged = false)
    {
        Interlocked.Increment(ref revision);
        Committed?.Invoke();
        if (globalSettingsChanged)
        {
            GlobalSettingsCommitted?.Invoke();
        }
    }
}