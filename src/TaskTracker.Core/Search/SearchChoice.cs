namespace TaskTracker.Core.Search;

/// <summary>A selectable choice for a search filter.</summary>
public sealed record SearchChoice(Guid Id, string Label, int SortOrder);