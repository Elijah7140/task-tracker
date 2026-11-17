namespace TaskTracker.Core.Persistence;

/// <summary>Signals committed application writes, including undo and redo.</summary>
public sealed class DataSaved
{
    public event Action? Committed;

    public void Publish()
    {
        Committed?.Invoke();
    }
}