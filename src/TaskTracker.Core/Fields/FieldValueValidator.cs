namespace TaskTracker.Core.Fields;

/// <summary>Checks scope, type and choice ownership before storing a new value.</summary>
public static class FieldValueValidator
{
    public static void Validate(Guid projectId, FieldDefinition field, FieldValueInput input,
        FieldChoice? choice)
    {
        if (input.FieldDefinitionId != field.Id)
        {
            throw new DomainRuleException("Value belongs to another field.");
        }

        if (field.ProjectId is not null && field.ProjectId != projectId)
        {
            throw new DomainRuleException("Field does not belong to the item's project.");
        }

        if (field.IsArchived)
        {
            throw new DomainRuleException("Archived fields cannot receive new values.");
        }

        ValidateColumns(field.DataType, input);
        ValidateChoice(field.Id, input.ChoiceId, choice);
    }

    private static void ValidateColumns(FieldDataType type, FieldValueInput input)
    {
        var count = (input.TextValue is null ? 0 : 1) + (input.NumberValue is null ? 0 : 1)
            + (input.DateValue is null ? 0 : 1) + (input.BoolValue is null ? 0 : 1)
            + (input.ChoiceId is null ? 0 : 1);

        if (count != 1 || !MatchesType(type, input))
        {
            throw new DomainRuleException("Exactly one value matching the field type is required.");
        }

        if (input.NumberValue is double number && !double.IsFinite(number))
        {
            throw new DomainRuleException("Number must be finite.");
        }
    }

    private static void ValidateChoice(Guid fieldId, Guid? choiceId, FieldChoice? choice)
    {
        if (choiceId is null)
        {
            return;
        }

        if (choice is null || choice.Id != choiceId ||
            choice.FieldDefinitionId != fieldId || choice.IsArchived)
        {
            throw new DomainRuleException("Choice is missing, archived, or belongs to another field.");
        }
    }

    private static bool MatchesType(FieldDataType type, FieldValueInput input)
    {
        return type switch
        {
            FieldDataType.Text => input.TextValue is not null,
            FieldDataType.Number => input.NumberValue is not null,
            FieldDataType.Date => input.DateValue is not null,
            FieldDataType.Boolean => input.BoolValue is not null,
            FieldDataType.Choice => input.ChoiceId is not null,
            _ => false
        };
    }
}