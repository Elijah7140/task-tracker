namespace TaskTracker.Core.CurrentItem;

/// <summary>What the tray card shows about the current item.</summary>
/// <param name="Id">The item.</param>
/// <param name="Title">The item's title.</param>
/// <param name="AreaPath">The project and folders that hold the item, joined by "›".</param>
/// <param name="StatusName">The item's status, if it has one.</param>
/// <param name="PriorityName">The item's priority level, if it has one.</param>
/// <param name="DueDate">The item's due date, if it has one.</param>
/// <param name="DueTime">The item's due time, if it has one.</param>
/// <param name="IsCompleted">Whether the item is checked off.</param>
/// <param name="Description">The item's notes, if any.</param>
public sealed record CurrentItemCard(
    Guid Id,
    string Title,
    string AreaPath,
    string? StatusName,
    string? PriorityName,
    DateOnly? DueDate,
    TimeOnly? DueTime,
    bool IsCompleted,
    string? Description);