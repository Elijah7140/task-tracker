using TaskTracker.Core.Fields;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class ChoiceFieldInputViewModelTests
{
    [Fact]
    public void Offers_none_then_the_active_choices_in_order()
    {
        var definition = CreateDefinition();
        var choices = new[] { CreateChoice(definition, "Blocked", 1), CreateChoice(definition, "Ready", 0) };

        var input = new ChoiceFieldInputViewModel(definition, null, choices);

        Assert.Equal(["(none)", "Ready", "Blocked"], input.Options.Select(option => option.Label));
        Assert.False(input.IsDirty);
    }

    [Fact]
    public void Archived_choices_are_not_offered_unless_the_item_uses_them()
    {
        var definition = CreateDefinition();
        var retired = CreateChoice(definition, "Retired", 0);
        retired.Archive();

        var input = new ChoiceFieldInputViewModel(definition, null, [retired, CreateChoice(definition, "Ready", 1)]);

        Assert.Equal(["(none)", "Ready"], input.Options.Select(option => option.Label));
    }

    [Fact]
    public void The_choice_the_item_already_uses_stays_selected_and_unchanged_when_archived()
    {
        var definition = CreateDefinition();
        var retired = CreateChoice(definition, "Retired", 0);
        retired.Archive();
        var value = CreateValue(definition, retired);

        var input = new ChoiceFieldInputViewModel(definition, value, [retired, CreateChoice(definition, "Ready", 1)]);

        Assert.Equal("Retired (archived)", input.Selected.Label);
        Assert.Contains(input.Options, option => option.Label == "Ready");
        Assert.False(input.IsDirty);
    }

    [Fact]
    public void Picking_a_choice_sends_its_id()
    {
        var definition = CreateDefinition();
        var ready = CreateChoice(definition, "Ready", 0);
        var input = new ChoiceFieldInputViewModel(definition, null, [ready]);

        input.Selected = input.Options[1];

        Assert.True(input.IsDirty);
        Assert.Equal(new FieldValueInput(definition.Id, ChoiceId: ready.Id), input.ToInput());
    }

    [Fact]
    public void Picking_none_removes_the_stored_choice()
    {
        var definition = CreateDefinition();
        var ready = CreateChoice(definition, "Ready", 0);
        var input = new ChoiceFieldInputViewModel(definition, CreateValue(definition, ready), [ready]);

        input.Selected = input.Options[0];

        Assert.True(input.IsDirty);
        Assert.Null(input.ToInput().ChoiceId);
    }

    [Fact]
    public void Revert_restores_the_stored_choice()
    {
        var definition = CreateDefinition();
        var ready = CreateChoice(definition, "Ready", 0);
        var input = new ChoiceFieldInputViewModel(definition, CreateValue(definition, ready), [ready]);
        input.Selected = input.Options[0];

        input.Revert();

        Assert.Equal("Ready", input.DisplayValue);
        Assert.False(input.IsDirty);
    }

    private static FieldDefinition CreateDefinition()
    {
        return FieldDefinition.Create("Status", FieldDataType.Choice, null, 0, []);
    }

    private static FieldChoice CreateChoice(FieldDefinition definition, string label, int order)
    {
        return FieldChoice.Create(definition.Id, label, order);
    }

    private static ItemFieldValue CreateValue(FieldDefinition definition, FieldChoice choice)
    {
        return ItemFieldValue.Create(Guid.NewGuid(), new FieldValueInput(definition.Id, ChoiceId: choice.Id));
    }
}