namespace TaskTracker.Core.Today;

/// <summary>A completion in the current day or one of its ancestors, with its display location.</summary>
public sealed record TodayItem(Guid Id, Guid ProjectId, string ProjectName, int ProjectOrder,
    Guid? FolderId, string AreaPath, Guid? ParentItemId, string Title, int SortOrder,
    bool IsCompleted, bool CompletedToday, bool HasDates);