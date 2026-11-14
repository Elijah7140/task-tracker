using TaskTracker.Core.Fields;

namespace TaskTracker.Core.Search;

/// <summary>A built-in column or active custom field available for search.</summary>
public sealed record SearchableField(string Key, string DisplayName, FieldDataType DataType, Guid? FieldDefinitionId)
{
    /// <summary>The column or custom definition used by this field.</summary>
    public FieldSource Source => FieldDefinitionId is Guid id
        ? new FieldSource.Custom(id) : new FieldSource.BuiltIn(Key);

    /// <summary>True when the field maps to a built-in item column.</summary>
    public bool IsBuiltIn => FieldDefinitionId is null;
}