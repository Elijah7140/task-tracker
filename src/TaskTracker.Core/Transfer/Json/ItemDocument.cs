namespace TaskTracker.Core.Transfer.Json;

/// <summary>
/// An item or sub-item. Type and priority are written by name and id; floating local values
/// (due, schedule) have no offset, UTC values (completion, timestamps) end with Z.
/// </summary>
public sealed class ItemDocument
{
    public Guid? Id { get; init; }

    public Guid? FolderId { get; init; }

    public Guid? ParentItemId { get; init; }

    public string? Title { get; init; }

    public string? Description { get; init; }

    public string? TicketNumber { get; init; }

    public Guid? ItemTypeId { get; init; }

    public string? ItemType { get; init; }

    public Guid? PriorityLevelId { get; init; }

    public string? Priority { get; init; }

    public string? DueDate { get; init; }

    public string? DueTime { get; init; }

    public string? ScheduledStart { get; init; }

    public string? ScheduledEnd { get; init; }

    /// <summary>Present when the item is complete.</summary>
    public string? CompletedAtUtc { get; init; }

    public int? SortOrder { get; init; }

    public string? CreatedAtUtc { get; init; }

    public string? UpdatedAtUtc { get; init; }

    public IReadOnlyList<FieldValueDocument>? FieldValues { get; init; }

    /// <summary>The item's links in order. Optional: files written before links existed simply lack it.</summary>
    public IReadOnlyList<ItemLinkDocument>? Links { get; init; }
}