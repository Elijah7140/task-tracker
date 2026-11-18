namespace TaskTracker.Presentation.ViewModels;

/// <summary>A priority and an index among the area's other top-level items, for a moved card.</summary>
public readonly record struct CardPlacement(Guid? PriorityLevelId, int Index);