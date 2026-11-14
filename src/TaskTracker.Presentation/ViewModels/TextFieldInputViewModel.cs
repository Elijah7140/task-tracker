using TaskTracker.Core.Fields;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>A single-line text value.</summary>
public sealed class TextFieldInputViewModel : CustomFieldInputViewModel
{
    private readonly string? storedText;
    private string text;

    public TextFieldInputViewModel(FieldDefinition definition, ItemFieldValue? value)
        : base(definition)
    {
        storedText = value?.TextValue;
        text = storedText ?? string.Empty;
    }

    public string Text
    {
        get => text;
        set
        {
            if (SetProperty(ref text, value))
            {
                NotifyValueChanged();
            }
        }
    }

    public override string DisplayValue
    {
        get { return Text; }
    }

    public override FieldValueInput ToInput()
    {
        var trimmed = string.IsNullOrWhiteSpace(Text) ? null : Text.Trim();

        return new FieldValueInput(FieldId, TextValue: trimmed);
    }

    public override void Revert()
    {
        Text = storedText ?? string.Empty;
    }

    protected override FieldValueInput OriginalInput()
    {
        return new FieldValueInput(FieldId, TextValue: storedText);
    }
}