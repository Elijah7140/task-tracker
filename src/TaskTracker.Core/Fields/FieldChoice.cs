namespace TaskTracker.Core.Fields;

/// <summary>A stable option for a choice field.</summary>
public sealed class FieldChoice
{
    /// <summary>The longest label a choice may have, once trimmed.</summary>
    public const int LabelMaxLength = 300;

    private FieldChoice()
    {
    }

    public Guid Id { get; private set; }

    public Guid FieldDefinitionId { get; private set; }

    public string Label { get; private set; } = string.Empty;

    public int SortOrder { get; private set; }

    public bool IsArchived { get; private set; }

    public static FieldChoice Create(Guid fieldId, string label, int sortOrder)
    {
        return new FieldChoice
        {
            Id = Guid.CreateVersion7(),
            FieldDefinitionId = fieldId,
            Label = Normalize(label),
            SortOrder = sortOrder
        };
    }

    public void Rename(string label)
    {
        Label = Normalize(label);
    }

    public void Archive()
    {
        IsArchived = true;
    }

    public void Unarchive()
    {
        IsArchived = false;
    }

    public void Reorder(int order)
    {
        SortOrder = order;
    }

    private static string Normalize(string label)
    {
        if (string.IsNullOrWhiteSpace(label) || label.Trim().Length > LabelMaxLength)
        {
            throw new DomainRuleException($"Choice label must be 1 to {LabelMaxLength} characters.");
        }

        return label.Trim();
    }
}