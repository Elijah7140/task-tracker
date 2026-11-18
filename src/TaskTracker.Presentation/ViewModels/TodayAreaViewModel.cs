namespace TaskTracker.Presentation.ViewModels;

/// <summary>An area breadcrumb and the roots of its completion tree.</summary>
public sealed record TodayAreaViewModel(string Path, IReadOnlyList<TodayRowViewModel> Rows);