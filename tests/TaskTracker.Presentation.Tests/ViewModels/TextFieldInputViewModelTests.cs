using TaskTracker.Core.Fields;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class TextFieldInputViewModelTests
{
    [Fact]
    public void Starts_empty_and_unchanged_without_a_stored_value()
    {
        var input = new TextFieldInputViewModel(CreateDefinition(), null);

        Assert.Equal(string.Empty, input.Text);
        Assert.False(input.IsDirty);
        Assert.Null(input.Error);
    }

    [Fact]
    public void Shows_the_stored_value_without_marking_it_dirty()
    {
        var input = new TextFieldInputViewModel(CreateDefinition(), CreateValue("Check cost"));

        Assert.Equal("Check cost", input.Text);
        Assert.False(input.IsDirty);
    }

    [Fact]
    public void Typing_makes_the_field_dirty_and_sends_the_trimmed_text()
    {
        var definition = CreateDefinition();
        var input = new TextFieldInputViewModel(definition, null);

        input.Text = "  New note  ";

        Assert.True(input.IsDirty);
        Assert.Equal(new FieldValueInput(definition.Id, TextValue: "New note"), input.ToInput());
    }

    [Fact]
    public void Blank_text_removes_a_stored_value()
    {
        var definition = CreateDefinition();
        var input = new TextFieldInputViewModel(definition, CreateValue("Old", definition));

        input.Text = "   ";

        Assert.True(input.IsDirty);
        Assert.Null(input.ToInput().TextValue);
    }

    [Fact]
    public void Blank_text_over_no_stored_value_is_not_a_change()
    {
        var input = new TextFieldInputViewModel(CreateDefinition(), null);

        input.Text = "   ";

        Assert.False(input.IsDirty);
    }

    [Fact]
    public void Revert_restores_the_stored_value()
    {
        var input = new TextFieldInputViewModel(CreateDefinition(), CreateValue("Stored"));
        input.Text = "Changed";

        input.Revert();

        Assert.Equal("Stored", input.Text);
        Assert.False(input.IsDirty);
    }

    [Fact]
    public void Display_value_is_the_text()
    {
        var input = new TextFieldInputViewModel(CreateDefinition(), CreateValue("Shown"));

        Assert.Equal("Shown", input.DisplayValue);
    }

    private static FieldDefinition CreateDefinition()
    {
        return FieldDefinition.Create("Summary", FieldDataType.Text, null, 0, []);
    }

    private static ItemFieldValue CreateValue(string text, FieldDefinition? definition = null)
    {
        var fieldId = definition?.Id ?? Guid.NewGuid();

        return ItemFieldValue.Create(Guid.NewGuid(), new FieldValueInput(fieldId, TextValue: text));
    }
}