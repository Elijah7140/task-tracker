using TaskTracker.Core.Fields;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>A global field listed read-only in a project's field manager.</summary>
public sealed class InheritedFieldRowViewModel(FieldDefinition field)
{
    public string Name { get; } = field.DisplayName;

    public FieldDataType DataType { get; } = field.DataType;
}