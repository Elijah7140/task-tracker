namespace TaskTracker.Core.Persistence;

/// <summary>Signals committed application writes, including undo and redo.</summary>
public sealed class DataSaved
{
    public event Action? Committed;

    /// <summary>Raised after <see cref="Committed"/> when the commit changed a global setting.</summary>
    public event Action? GlobalSettingsCommitted;

    public void Publish(bool globalSettingsChanged = false)
    {
        Committed?.Invoke();
        if (globalSettingsChanged)
        {
            GlobalSettingsCommitted?.Invoke();
        }
    }
}