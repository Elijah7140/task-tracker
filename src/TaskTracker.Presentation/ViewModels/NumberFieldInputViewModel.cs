using System.Globalization;

using TaskTracker.Core.Fields;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>A number typed as text and parsed with the current culture.</summary>
public sealed class NumberFieldInputViewModel : CustomFieldInputViewModel
{
    private readonly double? storedNumber;
    private string text;

    public NumberFieldInputViewModel(FieldDefinition definition, ItemFieldValue? value)
        : base(definition)
    {
        storedNumber = value?.NumberValue;
        text = FormatNumber(storedNumber);
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

    public override string? Error
    {
        get { return IsBlank || TryParse(out _) ? null : "Enter a valid number."; }
    }

    public override string DisplayValue
    {
        get { return Text; }
    }

    public override FieldValueInput ToInput()
    {
        return new FieldValueInput(FieldId, NumberValue: ParsedNumber());
    }

    public override void Revert()
    {
        Text = FormatNumber(storedNumber);
    }

    protected override FieldValueInput OriginalInput()
    {
        return new FieldValueInput(FieldId, NumberValue: storedNumber);
    }

    private bool IsBlank
    {
        get { return string.IsNullOrWhiteSpace(Text); }
    }

    private double? ParsedNumber()
    {
        return TryParse(out var number) ? number : null;
    }

    private bool TryParse(out double number)
    {
        var parsed = double.TryParse(Text, NumberStyles.Float, CultureInfo.CurrentCulture, out number);

        return parsed && double.IsFinite(number);
    }

    private static string FormatNumber(double? number)
    {
        return number?.ToString(CultureInfo.CurrentCulture) ?? string.Empty;
    }
}