namespace TaskTracker.Core.Search;

/// <summary>A compact item row in search results.</summary>
public sealed record ItemSearchResult(Guid ItemId, Guid ProjectId, string ProjectName, Guid? FolderId,
    Guid? ParentItemId, string Title, string? TicketNumber, Guid? ItemTypeId, Guid? PriorityLevelId,
    DateOnly? DueDate, TimeOnly? DueTime, bool IsCompleted)
{
    public Guid? StatusId { get; init; }

    public bool HasSchedule { get; init; }
}