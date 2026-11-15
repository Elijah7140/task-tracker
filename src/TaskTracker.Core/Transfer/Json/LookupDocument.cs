namespace TaskTracker.Core.Transfer.Json;

/// <summary>An item type or priority level; <see cref="IconKey"/> only applies to item types.</summary>
public sealed class LookupDocument
{
    public Guid? Id { get; init; }

    public string? Name { get; init; }

    public string? ColorKey { get; init; }

    public string? IconKey { get; init; }

    public bool? IsBuiltIn { get; init; }

    public bool? IsArchived { get; init; }

    public int? SortOrder { get; init; }
}