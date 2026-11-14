using TaskTracker.Core.Fields;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>A Yes/No value with a "(none)" entry for "not set".</summary>
public sealed class BooleanFieldInputViewModel : CustomFieldInputViewModel
{
    private readonly bool? storedValue;
    private BooleanOption selected;

    public BooleanFieldInputViewModel(FieldDefinition definition, ItemFieldValue? value)
        : base(definition)
    {
        storedValue = value?.BoolValue;
        Options =
        [
            new BooleanOption("(none)", null),
            new BooleanOption("Yes", true),
            new BooleanOption("No", false)
        ];
        selected = OptionFor(storedValue);
    }

    public IReadOnlyList<BooleanOption> Options { get; }

    public BooleanOption Selected
    {
        get => selected;
        set
        {
            if (value is not null && SetProperty(ref selected, value))
            {
                NotifyValueChanged();
            }
        }
    }

    public override string DisplayValue
    {
        get { return Selected.Label; }
    }

    public override FieldValueInput ToInput()
    {
        return new FieldValueInput(FieldId, BoolValue: Selected.Value);
    }

    public override void Revert()
    {
        Selected = OptionFor(storedValue);
    }

    protected override FieldValueInput OriginalInput()
    {
        return new FieldValueInput(FieldId, BoolValue: storedValue);
    }

    private BooleanOption OptionFor(bool? value)
    {
        return Options.First(option => option.Value == value);
    }
}