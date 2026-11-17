namespace TaskTracker.Core.Transfer.Json;

/// <summary>A saved search in its stored form (§7.7), with choices written as ids.</summary>
public sealed class SavedSearchDocument
{
    public Guid? Id { get; init; }

    public string? Name { get; init; }

    public string? QueryText { get; init; }

    /// <summary>One of AllProjects, Project or Folder.</summary>
    public string? ScopeKind { get; init; }

    public Guid? ProjectId { get; init; }

    public Guid? FolderId { get; init; }

    public bool? IncludeSubfolders { get; init; }

    public bool? IncludeCompleted { get; init; }

    public int? SortOrder { get; init; }

    public string? CreatedAtUtc { get; init; }

    public string? UpdatedAtUtc { get; init; }
}