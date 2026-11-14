namespace TaskTracker.Core.Fields;

/// <summary>One typed custom value belonging to an item.</summary>
public sealed class ItemFieldValue
{
    private ItemFieldValue()
    {
    }

    public Guid ItemId { get; private set; }

    public Guid FieldDefinitionId { get; private set; }

    public string? TextValue { get; private set; }

    public double? NumberValue { get; private set; }

    public DateOnly? DateValue { get; private set; }

    public bool? BoolValue { get; private set; }

    public Guid? ChoiceId { get; private set; }

    public static ItemFieldValue Create(Guid itemId, FieldValueInput input)
    {
        return new ItemFieldValue
        {
            ItemId = itemId,
            FieldDefinitionId = input.FieldDefinitionId,
            TextValue = input.TextValue?.Trim(),
            NumberValue = input.NumberValue,
            DateValue = input.DateValue,
            BoolValue = input.BoolValue,
            ChoiceId = input.ChoiceId
        };
    }

    public void Replace(FieldValueInput input)
    {
        TextValue = input.TextValue?.Trim();
        NumberValue = input.NumberValue;
        DateValue = input.DateValue;
        BoolValue = input.BoolValue;
        ChoiceId = input.ChoiceId;
    }
}