namespace TaskTracker.Presentation.ViewModels;

/// <summary>One project and its areas on the Today page.</summary>
public sealed record TodayProjectViewModel(string Name, IReadOnlyList<TodayAreaViewModel> Areas);