namespace TaskTracker.Presentation.ViewModels;

/// <summary>A parent and insertion index in the current area's item tree.</summary>
public readonly record struct ItemDropPlacement(Guid? ParentId, int Index);