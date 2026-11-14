using TaskTracker.Core;
using TaskTracker.Core.Fields;

namespace TaskTracker.Core.Tests.Fields;

public sealed class FieldValueValidatorTests
{
    [Theory]
    [InlineData(FieldDataType.Text)]
    [InlineData(FieldDataType.Number)]
    [InlineData(FieldDataType.Date)]
    [InlineData(FieldDataType.Boolean)]
    public void Matching_typed_value_is_accepted(FieldDataType type)
    {
        var field = FieldDefinition.Create("Field", type, null, 0, []);
        var input = type switch
        {
            FieldDataType.Text => new FieldValueInput(field.Id, TextValue: "a"),
            FieldDataType.Number => new FieldValueInput(field.Id, NumberValue: 0),
            FieldDataType.Date => new FieldValueInput(field.Id, DateValue: new DateOnly(2026, 1, 1)),
            _ => new FieldValueInput(field.Id, BoolValue: false)
        };

        FieldValueValidator.Validate(Guid.NewGuid(), field, input, null);

        Assert.NotNull(input);
    }

    [Fact]
    public void Wrong_type_and_multiple_columns_are_rejected()
    {
        var field = FieldDefinition.Create("Field", FieldDataType.Text, null, 0, []);

        Assert.Throws<DomainRuleException>(() => FieldValueValidator.Validate(Guid.NewGuid(), field,
            new FieldValueInput(field.Id, NumberValue: 1), null));
        Assert.Throws<DomainRuleException>(() => FieldValueValidator.Validate(Guid.NewGuid(), field,
            new FieldValueInput(field.Id, TextValue: "a", NumberValue: 1), null));
    }

    [Theory]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    [InlineData(double.NegativeInfinity)]
    public void Non_finite_numbers_are_rejected(double number)
    {
        var field = FieldDefinition.Create("Field", FieldDataType.Number, null, 0, []);

        Assert.Throws<DomainRuleException>(() => FieldValueValidator.Validate(Guid.NewGuid(), field,
            new FieldValueInput(field.Id, NumberValue: number), null));
    }

    [Fact]
    public void Project_field_cannot_be_used_in_another_project()
    {
        var field = FieldDefinition.Create("Field", FieldDataType.Text, Guid.NewGuid(), 0, []);

        Assert.Throws<DomainRuleException>(() => FieldValueValidator.Validate(Guid.NewGuid(), field,
            new FieldValueInput(field.Id, TextValue: "a"), null));
    }

    [Fact]
    public void Archived_field_cannot_receive_a_new_value()
    {
        var field = FieldDefinition.Create("Field", FieldDataType.Text, null, 0, []);
        field.Archive();

        Assert.Throws<DomainRuleException>(() => FieldValueValidator.Validate(Guid.NewGuid(), field,
            new FieldValueInput(field.Id, TextValue: "a"), null));
    }

    [Fact]
    public void Choice_must_belong_to_field_and_be_active()
    {
        var field = FieldDefinition.Create("Field", FieldDataType.Choice, null, 0, []);
        var choice = FieldChoice.Create(field.Id, "One", 0);
        var input = new FieldValueInput(field.Id, ChoiceId: choice.Id);

        FieldValueValidator.Validate(Guid.NewGuid(), field, input, choice);
        choice.Archive();

        Assert.Throws<DomainRuleException>(() => FieldValueValidator.Validate(Guid.NewGuid(), field, input, choice));
    }
}