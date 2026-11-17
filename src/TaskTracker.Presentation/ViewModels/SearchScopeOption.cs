namespace TaskTracker.Presentation.ViewModels;

/// <summary>A scope the user can pick, with its display label.</summary>
public sealed record SearchScopeOption(SearchScopeKind Kind, string Label);