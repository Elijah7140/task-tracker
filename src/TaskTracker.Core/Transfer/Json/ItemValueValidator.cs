using TaskTracker.Core.Fields;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>Checks the custom values of one item against the field definitions in the file (§7.1).</summary>
internal sealed class ItemValueValidator(ImportIndex index, IssueList issues)
{
    public void Validate(IReadOnlyList<FieldValueDocument> values, Guid? projectId, string path)
    {
        var usedKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        for (var position = 0; position < values.Count; position++)
        {
            var valuePath = ImportChecks.Element(path, position);
            ValidateValue(values[position], projectId, valuePath, usedKeys);
        }
    }

    private void ValidateValue(FieldValueDocument value, Guid? projectId, string path, HashSet<string> usedKeys)
    {
        var field = index.FindField(value.FieldKey);

        if (field is null)
        {
            issues.Add($"{path}.fieldKey", $"The field '{value.FieldKey}' is not defined in this file.");
            return;
        }

        if (!usedKeys.Add(value.FieldKey!.Trim()))
        {
            issues.Add($"{path}.fieldKey", $"The field '{value.FieldKey}' has more than one value on this item.");
        }

        if (field.ProjectId is not null && field.ProjectId != projectId)
        {
            issues.Add($"{path}.fieldKey", $"The field '{value.FieldKey}' belongs to another project.");
        }

        CheckColumns(field, value, path);
    }

    private void CheckColumns(FieldDocument field, FieldValueDocument value, string path)
    {
        if (!ImportChecks.TryParseDataType(field.DataType, out var type))
        {
            return;
        }

        if (CountValues(value) != 1)
        {
            issues.Add(path, "Exactly one value is required.");
            return;
        }

        if (!MatchesType(type, value))
        {
            issues.Add(path, $"The value does not match the field type {type}.");
            return;
        }

        CheckContent(field, type, value, path);
    }

    private static int CountValues(FieldValueDocument value)
    {
        var count = 0;

        if (value.Text is not null)
        {
            count++;
        }

        if (value.Number is not null)
        {
            count++;
        }

        if (value.Date is not null)
        {
            count++;
        }

        if (value.Boolean is not null)
        {
            count++;
        }

        if (value.ChoiceId is not null || value.ChoiceLabel is not null)
        {
            count++;
        }

        return count;
    }

    private static bool MatchesType(FieldDataType type, FieldValueDocument value)
    {
        return type switch
        {
            FieldDataType.Text => value.Text is not null,
            FieldDataType.Number => value.Number is not null,
            FieldDataType.Date => value.Date is not null,
            FieldDataType.Boolean => value.Boolean is not null,
            _ => value.ChoiceId is not null || value.ChoiceLabel is not null
        };
    }

    private void CheckContent(FieldDocument field, FieldDataType type, FieldValueDocument value, string path)
    {
        if (type == FieldDataType.Text && string.IsNullOrWhiteSpace(value.Text))
        {
            issues.Add($"{path}.text", "Blank text means no value; leave the value out instead.");
        }

        if (type == FieldDataType.Number && !double.IsFinite(value.Number!.Value))
        {
            issues.Add($"{path}.number", "The number must be finite.");
        }

        if (type == FieldDataType.Date && !TransferTimeFormat.TryParseDate(value.Date, out _))
        {
            issues.Add($"{path}.date", "Expected a date such as 2026-11-13.");
        }

        if (type == FieldDataType.Choice && index.FindChoice(field, value) is null)
        {
            issues.Add(path, $"The choice is not one of the options of the field '{field.Key}'.");
        }
    }
}