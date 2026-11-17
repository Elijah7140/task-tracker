namespace TaskTracker.Core.Transfer.Json;

/// <summary>A folder; <see cref="ParentFolderId"/> is null for a top-level folder.</summary>
public sealed class FolderDocument
{
    public Guid? Id { get; init; }

    public Guid? ParentFolderId { get; init; }

    public string? Name { get; init; }

    public int? SortOrder { get; init; }

    public string? CreatedAtUtc { get; init; }

    public string? UpdatedAtUtc { get; init; }
}