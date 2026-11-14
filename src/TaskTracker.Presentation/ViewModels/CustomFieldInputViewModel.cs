using TaskTracker.Core.Fields;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// One custom field's value in an item draft. Each data type has its own subclass that
/// knows how to show, parse, compare and revert that kind of value.
/// </summary>
public abstract class CustomFieldInputViewModel : ViewModelBase
{
    protected CustomFieldInputViewModel(FieldDefinition definition)
    {
        FieldId = definition.Id;
        Name = definition.DisplayName;
        IsArchived = definition.IsArchived;
    }

    public Guid FieldId { get; }

    public string Name { get; }

    public bool IsArchived { get; }

    /// <summary>The inline validation message, or null when the draft can be saved.</summary>
    public virtual string? Error
    {
        get { return null; }
    }

    /// <summary>The value as read-only text, used for archived fields.</summary>
    public abstract string DisplayValue { get; }

    /// <summary>True when the draft differs from the stored value, or cannot be parsed.</summary>
    public bool IsDirty
    {
        get { return Error is not null || ToInput() != OriginalInput(); }
    }

    /// <summary>The replacement value for this field; blank means "remove the value".</summary>
    public abstract FieldValueInput ToInput();

    /// <summary>Puts the stored value back into the draft.</summary>
    public abstract void Revert();

    /// <summary>The stored value, in the same shape <see cref="ToInput"/> produces.</summary>
    protected abstract FieldValueInput OriginalInput();

    /// <summary>Raises the change notifications every field type shares.</summary>
    protected void NotifyValueChanged()
    {
        OnPropertyChanged(nameof(Error));
        OnPropertyChanged(nameof(IsDirty));
        OnPropertyChanged(nameof(DisplayValue));
    }
}