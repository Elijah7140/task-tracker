namespace TaskTracker.Core.Undo;

/// <summary>A recorder that remembers nothing, for contexts that deliberately have no undo history.</summary>
public sealed class NullUndoRecorder : IUndoRecorder
{
    private NullUndoRecorder()
    {
    }

    /// <summary>The shared instance.</summary>
    public static NullUndoRecorder Instance { get; } = new();

    /// <inheritdoc />
    public void Record(IUndoableChange change)
    {
    }
}