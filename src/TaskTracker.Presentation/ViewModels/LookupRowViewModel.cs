using System.Globalization;

using TaskTracker.Core.Lookups;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>One row of a lookup list, with the enablement of its row buttons.</summary>
public sealed class LookupRowViewModel(LookupEntity entity, bool isItemType, bool canMoveUp, bool canMoveDown)
{
    private readonly string savedNumber = FormatNumber(entity);

    public Guid Id { get; } = entity.Id;

    public string Name { get; } = entity.Name;

    /// <summary>The row's text: a priority level's label, or a status with its kind ("Testing · Open").</summary>
    public string DisplayName { get; } = entity switch
    {
        PriorityLevel priority => priority.Label,
        StatusLevel status => $"{status.Name} · {status.Kind}",
        _ => entity.Name
    };

    /// <summary>The text of a priority row's Number box; edited in place and saved by its command.</summary>
    public string Number { get; set; } = FormatNumber(entity);

    /// <summary>True while the Number box holds text that has not been saved.</summary>
    public bool HasUnsavedNumber => Number != savedNumber;

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

    private static string FormatNumber(LookupEntity entity)
    {
        var number = (entity as PriorityLevel)?.Number;
        return number?.ToString(CultureInfo.InvariantCulture) ?? string.Empty;
    }
}