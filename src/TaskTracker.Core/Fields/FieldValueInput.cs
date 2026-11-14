namespace TaskTracker.Core.Fields;

/// <summary>Replacement value supplied by the item editor.</summary>
public sealed record FieldValueInput(
    Guid FieldDefinitionId,
    string? TextValue = null,
    double? NumberValue = null,
    DateOnly? DateValue = null,
    bool? BoolValue = null,
    Guid? ChoiceId = null);