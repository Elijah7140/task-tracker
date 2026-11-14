using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Builds the custom-field inputs for one item from the stored fields and values.</summary>
public sealed class CustomFieldInputLoader(FieldService fields, ItemService items) : ICustomFieldInputLoader
{
    /// <inheritdoc />
    public async Task<IReadOnlyList<CustomFieldInputViewModel>> LoadAsync(Guid projectId, Guid itemId)
    {
        var values = await items.LoadFieldValuesAsync(itemId);
        var definitions = await fields.ListAllAsync(projectId);
        var inputs = new List<CustomFieldInputViewModel>();

        foreach (var definition in ActiveFields(definitions).Concat(ArchivedFieldsWithValues(definitions, values)))
        {
            var value = values.FirstOrDefault(row => row.FieldDefinitionId == definition.Id);
            inputs.Add(await CreateInputAsync(definition, value));
        }

        return inputs;
    }

    /// <summary>Active global fields first, then the project's own, each in sort order.</summary>
    private static List<FieldDefinition> ActiveFields(IReadOnlyList<FieldDefinition> definitions)
    {
        var active = definitions.Where(definition => !definition.IsArchived).ToList();
        var global = active.Where(definition => definition.ProjectId is null).OrderBy(definition => definition.SortOrder);
        var project = active.Where(definition => definition.ProjectId is not null).OrderBy(definition => definition.SortOrder);

        return global.Concat(project).ToList();
    }

    private static List<FieldDefinition> ArchivedFieldsWithValues(IReadOnlyList<FieldDefinition> definitions,
        IReadOnlyList<ItemFieldValue> values)
    {
        return definitions
            .Where(definition => definition.IsArchived)
            .Where(definition => values.Any(row => row.FieldDefinitionId == definition.Id))
            .OrderBy(definition => definition.SortOrder)
            .ToList();
    }

    private async Task<CustomFieldInputViewModel> CreateInputAsync(FieldDefinition definition,
        ItemFieldValue? value)
    {
        switch (definition.DataType)
        {
            case FieldDataType.Number:
                return new NumberFieldInputViewModel(definition, value);
            case FieldDataType.Date:
                return new DateFieldInputViewModel(definition, value);
            case FieldDataType.Boolean:
                return new BooleanFieldInputViewModel(definition, value);
            case FieldDataType.Choice:
                var choices = await fields.ListChoicesAsync(definition.Id);
                return new ChoiceFieldInputViewModel(definition, value, choices);
            default:
                return new TextFieldInputViewModel(definition, value);
        }
    }
}