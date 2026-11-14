using TaskTracker.Core.Fields;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class BooleanFieldInputViewModelTests
{
    [Fact]
    public void Offers_none_yes_and_no_with_none_selected_by_default()
    {
        var input = new BooleanFieldInputViewModel(CreateDefinition(), null);

        Assert.Equal(["(none)", "Yes", "No"], input.Options.Select(option => option.Label));
        Assert.Equal("(none)", input.Selected.Label);
        Assert.False(input.IsDirty);
    }

    [Theory]
    [InlineData(true, "Yes")]
    [InlineData(false, "No")]
    public void Selects_the_stored_value(bool stored, string expectedLabel)
    {
        var input = new BooleanFieldInputViewModel(CreateDefinition(), CreateValue(stored));

        Assert.Equal(expectedLabel, input.Selected.Label);
        Assert.False(input.IsDirty);
    }

    [Fact]
    public void Choosing_yes_sends_true()
    {
        var definition = CreateDefinition();
        var input = new BooleanFieldInputViewModel(definition, null);

        input.Selected = input.Options[1];

        Assert.True(input.IsDirty);
        Assert.Equal(new FieldValueInput(definition.Id, BoolValue: true), input.ToInput());
    }

    [Fact]
    public void Choosing_no_sends_false_rather_than_removing_the_value()
    {
        var definition = CreateDefinition();
        var input = new BooleanFieldInputViewModel(definition, null);

        input.Selected = input.Options[2];

        Assert.Equal(new FieldValueInput(definition.Id, BoolValue: false), input.ToInput());
    }

    [Fact]
    public void Choosing_none_removes_a_stored_value()
    {
        var input = new BooleanFieldInputViewModel(CreateDefinition(), CreateValue(true));

        input.Selected = input.Options[0];

        Assert.True(input.IsDirty);
        Assert.Null(input.ToInput().BoolValue);
    }

    [Fact]
    public void Revert_restores_the_stored_value()
    {
        var input = new BooleanFieldInputViewModel(CreateDefinition(), CreateValue(true));
        input.Selected = input.Options[2];

        input.Revert();

        Assert.Equal("Yes", input.DisplayValue);
        Assert.False(input.IsDirty);
    }

    private static FieldDefinition CreateDefinition()
    {
        return FieldDefinition.Create("Approved", FieldDataType.Boolean, null, 0, []);
    }

    private static ItemFieldValue CreateValue(bool value)
    {
        return ItemFieldValue.Create(Guid.NewGuid(), new FieldValueInput(Guid.NewGuid(), BoolValue: value));
    }
}