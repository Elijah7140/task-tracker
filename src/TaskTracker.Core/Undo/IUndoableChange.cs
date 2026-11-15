namespace TaskTracker.Core.Undo;

/// <summary>A committed operation that can be applied in either direction.</summary>
public interface IUndoableChange
{
    /// <summary>Short name of the operation, such as "Complete 'Write report'".</summary>
    string Description { get; }

    /// <summary>Restores the state before the operation, or throws <see cref="DomainRuleException"/> when it can no longer be restored.</summary>
    Task UndoAsync(CancellationToken cancellationToken = default);

    /// <summary>Reapplies the operation, or throws <see cref="DomainRuleException"/> when it can no longer be applied.</summary>
    Task RedoAsync(CancellationToken cancellationToken = default);
}