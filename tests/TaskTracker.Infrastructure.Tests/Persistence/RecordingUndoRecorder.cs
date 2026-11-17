using TaskTracker.Core.Undo;

namespace TaskTracker.Infrastructure.Tests.Persistence;

/// <summary>Passes each recorded step on to a history and remembers its description, so tests can assert what was recorded.</summary>
internal sealed class RecordingUndoRecorder(IUndoRecorder inner) : IUndoRecorder
{
    public List<string> Descriptions { get; } = [];

    public void Record(IUndoableChange change)
    {
        Descriptions.Add(change.Description);
        inner.Record(change);
    }
}