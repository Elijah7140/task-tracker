using TaskTracker.Core;
using TaskTracker.Core.Fields;

namespace TaskTracker.Core.Tests.Fields;

public sealed class FieldDefinitionTests
{
    [Fact]
    public void Key_is_a_stable_slug_with_a_collision_suffix()
    {
        var field = FieldDefinition.Create(" Customer impact ", FieldDataType.Text, null, 0, []);
        var second = FieldDefinition.Create("Customer impact", FieldDataType.Text, null, 1, [field.Key]);

        field.Rename("Impact");

        Assert.Equal("customer-impact", field.Key);
        Assert.Equal("customer-impact-2", second.Key);
        Assert.Equal("Impact", field.DisplayName);
    }

    [Fact]
    public void A_field_with_values_cannot_change_type()
    {
        var field = FieldDefinition.Create("Effort", FieldDataType.Number, null, 0, []);

        Assert.Throws<DomainRuleException>(() => field.ChangeType(FieldDataType.Date, true));

        Assert.Equal(FieldDataType.Number, field.DataType);
    }

    [Fact]
    public void A_field_without_values_can_change_type()
    {
        var field = FieldDefinition.Create("Effort", FieldDataType.Number, null, 0, []);

        field.ChangeType(FieldDataType.Date, false);

        Assert.Equal(FieldDataType.Date, field.DataType);
    }

    [Fact]
    public void Display_name_is_required()
    {
        Assert.Throws<DomainRuleException>(() => FieldDefinition.Create(" ", FieldDataType.Text, null, 0, []));
    }
}