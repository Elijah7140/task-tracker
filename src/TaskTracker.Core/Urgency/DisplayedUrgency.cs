namespace TaskTracker.Core.Urgency;

/// <summary>Displayed urgency and the descendant responsible for it, if any.</summary>
public sealed record DisplayedUrgency(Urgency Value, Guid? SourceDescendantId);