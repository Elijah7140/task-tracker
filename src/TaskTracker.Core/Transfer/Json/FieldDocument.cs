namespace TaskTracker.Core.Transfer.Json;

/// <summary>A custom field definition; <see cref="ProjectId"/> is null for a global field.</summary>
public sealed class FieldDocument
{
    public Guid? Id { get; init; }

    public string? Key { get; init; }

    public string? DisplayName { get; init; }

    /// <summary>One of Text, Number, Date, Boolean or Choice.</summary>
    public string? DataType { get; init; }

    public Guid? ProjectId { get; init; }

    public bool? IsArchived { get; init; }

    public int? SortOrder { get; init; }

    public IReadOnlyList<ChoiceDocument>? Choices { get; init; }
}