namespace TaskTracker.Core.Undo;

/// <summary>Receives each committed undoable operation. Tests substitute a fake to see exactly what was recorded.</summary>
public interface IUndoRecorder
{
    /// <summary>Adds a step to the history and clears any redo steps.</summary>
    void Record(IUndoableChange change);
}