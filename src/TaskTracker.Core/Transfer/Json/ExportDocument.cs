namespace TaskTracker.Core.Transfer.Json;

/// <summary>
/// The root of a JSON export (§7.9). Every property is optional when reading, so that a missing
/// value becomes an import issue with a path instead of a crash.
/// </summary>
public sealed class ExportDocument
{
    /// <summary>The value of <see cref="Format"/> in every export.</summary>
    public const string FormatName = "task-tracker";

    /// <summary>The only document version this application writes and reads.</summary>
    public const int CurrentVersion = 1;

    /// <summary>The scope value of a whole-database export.</summary>
    public const string AllScope = "all";

    /// <summary>The scope value of a single-project export.</summary>
    public const string ProjectScope = "project";

    public string? Format { get; init; }

    public int? Version { get; init; }

    public string? ExportedAtUtc { get; init; }

    public string? Scope { get; init; }

    public IReadOnlyList<LookupDocument>? ItemTypes { get; init; }

    public IReadOnlyList<LookupDocument>? PriorityLevels { get; init; }

    public IReadOnlyList<FieldDocument>? Fields { get; init; }

    /// <summary>Global settings, exported for reference; an import never changes the target's global settings.</summary>
    public IReadOnlyDictionary<string, string>? GlobalSettings { get; init; }

    public IReadOnlyList<ProjectDocument>? Projects { get; init; }

    public IReadOnlyList<SavedSearchDocument>? SavedSearches { get; init; }
}