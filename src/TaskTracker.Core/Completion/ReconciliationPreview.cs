namespace TaskTracker.Core.Completion;

/// <summary>Counts of parent transitions required when enabling auto-completion.</summary>
public sealed record ReconciliationPreview(int ParentsToComplete, int ParentsToReopen);