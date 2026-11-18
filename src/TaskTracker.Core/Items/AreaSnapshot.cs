using TaskTracker.Core.Lookups;
using TaskTracker.Core.Settings;

namespace TaskTracker.Core.Items;

/// <summary>All data needed to render one project area.</summary>
public sealed record AreaSnapshot(
    Guid ProjectId,
    Guid? FolderId,
    IReadOnlyList<ItemNode> Items,
    IReadOnlyList<ItemType> ItemTypes,
    IReadOnlyList<PriorityLevel> PriorityLevels,
    EffectiveSettings Settings)
{
    public IReadOnlyList<StatusLevel> Statuses { get; init; } = [];
}