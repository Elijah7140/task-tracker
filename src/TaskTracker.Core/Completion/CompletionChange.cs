namespace TaskTracker.Core.Completion;

/// <summary>A proposed completion timestamp update for one item.</summary>
public sealed record CompletionChange(Guid ItemId, DateTime? CompletedAtUtc);