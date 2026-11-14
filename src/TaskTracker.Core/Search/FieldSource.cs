namespace TaskTracker.Core.Search;

/// <summary>The column or custom definition backing a searchable field.</summary>
public abstract record FieldSource
{
    /// <summary>A built-in item column.</summary>
    public sealed record BuiltIn(string Column) : FieldSource;

    /// <summary>A custom field definition.</summary>
    public sealed record Custom(Guid FieldDefinitionId) : FieldSource;
}