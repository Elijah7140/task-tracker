namespace TaskTracker.Core.Transfer.Json;

/// <summary>A project with its folders, items and setting overrides.</summary>
public sealed class ProjectDocument
{
    public Guid? Id { get; init; }

    public string? Name { get; init; }

    public string? Description { get; init; }

    public int? SortOrder { get; init; }

    public string? CreatedAtUtc { get; init; }

    public string? UpdatedAtUtc { get; init; }

    /// <summary>The project's setting overrides by setting key.</summary>
    public IReadOnlyDictionary<string, string>? Settings { get; init; }

    public IReadOnlyList<FolderDocument>? Folders { get; init; }

    public IReadOnlyList<ItemDocument>? Items { get; init; }
}