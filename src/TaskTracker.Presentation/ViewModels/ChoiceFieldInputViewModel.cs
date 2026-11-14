using TaskTracker.Core.Fields;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// A pick from the field's active choices. An item that still holds an archived choice
/// keeps it in the list, labelled "(archived)", so the value is neither lost nor hidden.
/// </summary>
public sealed class ChoiceFieldInputViewModel : CustomFieldInputViewModel
{
    private readonly Guid? storedChoiceId;
    private ChoiceOption selected;

    public ChoiceFieldInputViewModel(FieldDefinition definition, ItemFieldValue? value,
        IReadOnlyList<FieldChoice> choices)
        : base(definition)
    {
        storedChoiceId = value?.ChoiceId;
        Options = BuildOptions(choices, storedChoiceId);
        selected = OptionFor(storedChoiceId);
    }

    public IReadOnlyList<ChoiceOption> Options { get; }

    public ChoiceOption Selected
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
        return new FieldValueInput(FieldId, ChoiceId: Selected.Id);
    }

    public override void Revert()
    {
        Selected = OptionFor(storedChoiceId);
    }

    protected override FieldValueInput OriginalInput()
    {
        return new FieldValueInput(FieldId, ChoiceId: storedChoiceId);
    }

    private ChoiceOption OptionFor(Guid? choiceId)
    {
        return Options.FirstOrDefault(option => option.Id == choiceId) ?? Options[0];
    }

    private static List<ChoiceOption> BuildOptions(IReadOnlyList<FieldChoice> choices, Guid? storedChoiceId)
    {
        var options = new List<ChoiceOption> { new ChoiceOption("(none)", null) };
        var shown = choices.Where(choice => !choice.IsArchived || choice.Id == storedChoiceId);

        foreach (var choice in shown.OrderBy(choice => choice.SortOrder))
        {
            var label = choice.IsArchived ? $"{choice.Label} (archived)" : choice.Label;
            options.Add(new ChoiceOption(label, choice.Id));
        }

        return options;
    }
}