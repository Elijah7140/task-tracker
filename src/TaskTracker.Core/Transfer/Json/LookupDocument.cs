namespace TaskTracker.Core.Transfer.Json;

/// <summary>
/// An item type, priority level or status. <see cref="IconKey"/> only applies to item types,
/// <see cref="Number"/> to priority levels and <see cref="Kind"/> to statuses.
/// </summary>
public sealed class LookupDocument
{
    public Guid? Id { get; init; }

    public string? Name { get; init; }

    /// <summary>A priority level's number label; such a level may have an empty name.</summary>
    public int? Number { get; init; }

    /// <summary>A status's kind: "open" or "done".</summary>
    public string? Kind { get; init; }

    public string? ColorKey { get; init; }

    public string? IconKey { get; init; }

    public bool? IsBuiltIn { get; init; }

    public bool? IsArchived { get; init; }

    public int? SortOrder { get; init; }
}