namespace TaskTracker.Core.Items;

/// <summary>Where an active item currently lives.</summary>
public sealed record ItemLocation(Guid ProjectId, Guid? FolderId);