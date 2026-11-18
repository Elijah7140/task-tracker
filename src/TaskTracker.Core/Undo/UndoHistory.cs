using TaskTracker.Core.Fields;

namespace TaskTracker.Core.Undo;

/// <summary>
/// Holds the most recent undo steps of the current application session, in memory only.
/// Undoing moves back through the steps and redoing moves forward; recording a new step
/// drops every step that was undone. Recording can happen on any thread while a step is being
/// applied, so every change to the list is made under a lock; undo and redo run one at a time.
/// </summary>
public sealed class UndoHistory(FieldWriteGate? writeGate = null) : IUndoRecorder
{
    /// <summary>The number of steps kept; older ones are forgotten.</summary>
    public const int Capacity = 50;

    private readonly object gate = new();
    private readonly FieldWriteGate writes = writeGate ?? FieldWriteGate.Shared;
    private readonly List<IUndoableChange> changes = [];
    private int position;

    /// <summary>Raised after a step is recorded, undone, redone or the history is cleared.</summary>
    public event EventHandler? Changed;

    public bool CanUndo
    {
        get
        {
            lock (gate)
            {
                return position > 0;
            }
        }
    }

    public bool CanRedo
    {
        get
        {
            lock (gate)
            {
                return position < changes.Count;
            }
        }
    }

    public string? UndoDescription
    {
        get
        {
            lock (gate)
            {
                return position > 0 ? changes[position - 1].Description : null;
            }
        }
    }

    public string? RedoDescription
    {
        get
        {
            lock (gate)
            {
                return position < changes.Count ? changes[position].Description : null;
            }
        }
    }

    /// <inheritdoc />
    public void Record(IUndoableChange change)
    {
        lock (gate)
        {
            changes.RemoveRange(position, changes.Count - position);
            changes.Add(change);

            if (changes.Count > Capacity)
            {
                changes.RemoveAt(0);
            }

            position = changes.Count;
        }

        Changed?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>Forgets every step, undoable or redoable.</summary>
    public void Clear()
    {
        lock (gate)
        {
            changes.Clear();
            position = 0;
        }

        Changed?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>Undoes the latest step and returns its description; a refused step leaves the history unchanged.</summary>
    public Task<string> UndoAsync(CancellationToken cancellationToken = default)
    {
        return ApplyAsync(true, cancellationToken);
    }

    /// <summary>Redoes the next step and returns its description; a refused step leaves the history unchanged.</summary>
    public Task<string> RedoAsync(CancellationToken cancellationToken = default)
    {
        return ApplyAsync(false, cancellationToken);
    }

    private async Task<string> ApplyAsync(bool undo, CancellationToken cancellationToken)
    {
        using var lease = await writes.EnterAsync(cancellationToken);
        var change = NextStep(undo);
        if (undo)
        {
            await change.UndoAsync(cancellationToken);
        }
        else
        {
            await change.RedoAsync(cancellationToken);
        }

        MarkApplied(change, undo);
        Changed?.Invoke(this, EventArgs.Empty);
        return change.Description;
    }

    private IUndoableChange NextStep(bool undo)
    {
        lock (gate)
        {
            if (undo && position > 0)
            {
                return changes[position - 1];
            }

            if (!undo && position < changes.Count)
            {
                return changes[position];
            }
        }

        throw new DomainRuleException(undo ? "There is no action to undo." : "There is no action to redo.");
    }

    /// <summary>
    /// Moves the position past a step that was applied. If a new step was recorded meanwhile, an
    /// undone step is dropped (a new action clears redo) and a redone step is already gone.
    /// </summary>
    private void MarkApplied(IUndoableChange change, bool undo)
    {
        lock (gate)
        {
            var index = changes.IndexOf(change);

            if (index < 0)
            {
                return;
            }

            if (undo)
            {
                MarkUndone(index);
            }
            else if (index == position)
            {
                position++;
            }
        }
    }

    private void MarkUndone(int index)
    {
        if (index != position - 1)
        {
            changes.RemoveAt(index);
        }

        position--;
    }
}