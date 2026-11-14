using System.Globalization;

using TaskTracker.Core.Fields;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class NumberFieldInputViewModelTests
{
    [Fact]
    public void Starts_empty_and_unchanged_without_a_stored_value()
    {
        var input = new NumberFieldInputViewModel(CreateDefinition(), null);

        Assert.Equal(string.Empty, input.Text);
        Assert.False(input.IsDirty);
        Assert.Null(input.Error);
    }

    [Fact]
    public void Shows_the_stored_number_as_text()
    {
        var input = new NumberFieldInputViewModel(CreateDefinition(), CreateValue(3.5));

        Assert.Equal("3.5", input.Text);
        Assert.False(input.IsDirty);
    }

    [Fact]
    public void A_valid_number_is_parsed_and_sent()
    {
        var definition = CreateDefinition();
        var input = new NumberFieldInputViewModel(definition, null);

        input.Text = "12.5";

        Assert.Null(input.Error);
        Assert.True(input.IsDirty);
        Assert.Equal(new FieldValueInput(definition.Id, NumberValue: 12.5), input.ToInput());
    }

    [Theory]
    [InlineData("twelve")]
    [InlineData("1.2.3")]
    [InlineData("Infinity")]
    [InlineData("NaN")]
    public void Text_that_is_not_a_finite_number_shows_an_inline_error(string text)
    {
        var input = new NumberFieldInputViewModel(CreateDefinition(), null);

        input.Text = text;

        Assert.Equal("Enter a valid number.", input.Error);
    }

    [Fact]
    public void An_invalid_number_counts_as_a_change_so_the_draft_cannot_be_forgotten()
    {
        var input = new NumberFieldInputViewModel(CreateDefinition(), null);

        input.Text = "twelve";

        Assert.True(input.IsDirty);
        Assert.Null(input.ToInput().NumberValue);
    }

    [Fact]
    public void Error_notifications_follow_the_text()
    {
        var input = new NumberFieldInputViewModel(CreateDefinition(), null);
        var changed = new List<string?>();
        input.PropertyChanged += (_, args) => changed.Add(args.PropertyName);

        input.Text = "x";

        Assert.Contains(nameof(NumberFieldInputViewModel.Error), changed);
        Assert.Contains(nameof(NumberFieldInputViewModel.IsDirty), changed);
    }

    [Fact]
    public void Blank_text_removes_a_stored_number()
    {
        var input = new NumberFieldInputViewModel(CreateDefinition(), CreateValue(7));

        input.Text = " ";

        Assert.Null(input.Error);
        Assert.True(input.IsDirty);
        Assert.Null(input.ToInput().NumberValue);
    }

    [Fact]
    public void The_same_number_written_differently_is_not_a_change()
    {
        var input = new NumberFieldInputViewModel(CreateDefinition(), CreateValue(12));

        input.Text = "12.0";

        Assert.False(input.IsDirty);
    }

    [Fact]
    public void Numbers_use_the_current_culture()
    {
        var previous = CultureInfo.CurrentCulture;
        string shown;
        string? error;
        double? parsed;

        try
        {
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("fr-FR");
            var input = new NumberFieldInputViewModel(CreateDefinition(), CreateValue(1.5));
            shown = input.Text;
            input.Text = "12,5";
            error = input.Error;
            parsed = input.ToInput().NumberValue;
        }
        finally
        {
            CultureInfo.CurrentCulture = previous;
        }

        Assert.Equal("1,5", shown);
        Assert.Null(error);
        Assert.Equal(12.5, parsed);
    }

    [Fact]
    public void Revert_restores_the_stored_number_and_clears_the_error()
    {
        var input = new NumberFieldInputViewModel(CreateDefinition(), CreateValue(4));
        input.Text = "oops";

        input.Revert();

        Assert.Equal("4", input.Text);
        Assert.Null(input.Error);
        Assert.False(input.IsDirty);
    }

    private static FieldDefinition CreateDefinition()
    {
        return FieldDefinition.Create("Effort", FieldDataType.Number, null, 0, []);
    }

    private static ItemFieldValue CreateValue(double number)
    {
        return ItemFieldValue.Create(Guid.NewGuid(), new FieldValueInput(Guid.NewGuid(), NumberValue: number));
    }
}