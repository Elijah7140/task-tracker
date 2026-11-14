using TaskTracker.Core.Fields;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class DateFieldInputViewModelTests
{
    private static readonly DateOnly StoredDate = new(2026, 11, 20);

    [Fact]
    public void Starts_empty_and_unchanged_without_a_stored_value()
    {
        var input = new DateFieldInputViewModel(CreateDefinition(), null);

        Assert.Null(input.Date);
        Assert.False(input.IsDirty);
        Assert.Equal("(none)", input.DisplayValue);
    }

    [Fact]
    public void Shows_the_stored_date_in_the_picker()
    {
        var input = new DateFieldInputViewModel(CreateDefinition(), CreateValue());

        Assert.Equal(new DateTime(2026, 11, 20), input.Date);
        Assert.False(input.IsDirty);
    }

    [Fact]
    public void Picking_a_date_sends_it_as_a_date_only_value()
    {
        var definition = CreateDefinition();
        var input = new DateFieldInputViewModel(definition, null);

        input.Date = new DateTime(2026, 12, 1, 15, 30, 0);

        Assert.True(input.IsDirty);
        Assert.Equal(new FieldValueInput(definition.Id, DateValue: new DateOnly(2026, 12, 1)), input.ToInput());
    }

    [Fact]
    public void The_clear_button_removes_a_stored_date()
    {
        var input = new DateFieldInputViewModel(CreateDefinition(), CreateValue());

        input.ClearCommand.Execute(null);

        Assert.Null(input.Date);
        Assert.True(input.IsDirty);
        Assert.Null(input.ToInput().DateValue);
    }

    [Fact]
    public void Revert_restores_the_stored_date()
    {
        var input = new DateFieldInputViewModel(CreateDefinition(), CreateValue());
        input.ClearCommand.Execute(null);

        input.Revert();

        Assert.Equal(new DateTime(2026, 11, 20), input.Date);
        Assert.False(input.IsDirty);
    }

    private static FieldDefinition CreateDefinition()
    {
        return FieldDefinition.Create("Review date", FieldDataType.Date, null, 0, []);
    }

    private static ItemFieldValue CreateValue()
    {
        return ItemFieldValue.Create(Guid.NewGuid(), new FieldValueInput(Guid.NewGuid(), DateValue: StoredDate));
    }
}