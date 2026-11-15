namespace TaskTracker.Core.Transfer.Json;

/// <summary>
/// One custom value of an item, tied to its field by key. Exactly one of the typed values is set;
/// a choice carries its label and, in an export, the choice id.
/// </summary>
public sealed class FieldValueDocument
{
    public string? FieldKey { get; init; }

    public string? Text { get; init; }

    public double? Number { get; init; }

    public string? Date { get; init; }

    public bool? Boolean { get; init; }

    public Guid? ChoiceId { get; init; }

    public string? ChoiceLabel { get; init; }
}