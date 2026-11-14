using TaskTracker.Core.Lookups;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>One row of a lookup list, with the enablement of its row buttons.</summary>
public sealed class LookupRowViewModel(LookupEntity entity, bool isItemType, bool canMoveUp, bool canMoveDown)
{
    public Guid Id { get; } = entity.Id;

    public string Name { get; } = entity.Name;

    public bool IsBuiltIn { get; } = entity.IsBuiltIn;

    public bool IsArchived { get; } = entity.IsArchived;

    public bool CanMoveUp { get; } = canMoveUp;

    public bool CanMoveDown { get; } = canMoveDown;

    /// <summary>Built-in item types are the only rows that cannot be archived.</summary>
    public bool CanArchive { get; } = !entity.IsArchived && !(isItemType && entity.IsBuiltIn);

    /// <summary>Explains why a row's Archive button is disabled.</summary>
    public string ArchiveTooltip { get; } = isItemType && entity.IsBuiltIn
        ? "Built-in types can't be archived"
        : "Archive";
}