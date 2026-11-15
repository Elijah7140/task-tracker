namespace TaskTracker.Core.Transfer.Json;

/// <summary>One option of a choice field.</summary>
public sealed class ChoiceDocument
{
    public Guid? Id { get; init; }

    public string? Label { get; init; }

    public int? SortOrder { get; init; }

    public bool? IsArchived { get; init; }
}