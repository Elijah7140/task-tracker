using TaskTracker.Core.Fields;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Persistence;

namespace TaskTracker.Core.Transfer;

/// <summary>Every lookup, field definition and choice, loaded once so exporters can name what items reference.</summary>
internal sealed class ExportCatalogue
{
    private readonly Dictionary<Guid, ItemType> typesById;
    private readonly Dictionary<Guid, PriorityLevel> prioritiesById;
    private readonly Dictionary<Guid, FieldChoice> choicesById;

    private ExportCatalogue(
        IReadOnlyList<ItemType> itemTypes,
        IReadOnlyList<PriorityLevel> priorityLevels,
        IReadOnlyList<FieldDefinition> fields,
        IReadOnlyList<FieldChoice> choices)
    {
        ItemTypes = itemTypes;
        PriorityLevels = priorityLevels;
        Fields = fields;
        Choices = choices;
        typesById = itemTypes.ToDictionary(type => type.Id);
        prioritiesById = priorityLevels.ToDictionary(level => level.Id);
        choicesById = choices.ToDictionary(choice => choice.Id);
        FieldsById = fields.ToDictionary(field => field.Id);
    }

    public IReadOnlyList<ItemType> ItemTypes { get; }

    public IReadOnlyList<PriorityLevel> PriorityLevels { get; }

    public IReadOnlyList<FieldDefinition> Fields { get; }

    public IReadOnlyList<FieldChoice> Choices { get; }

    public IReadOnlyDictionary<Guid, FieldDefinition> FieldsById { get; }

    public static async Task<ExportCatalogue> LoadAsync(IUnitOfWork work, CancellationToken cancellationToken)
    {
        var itemTypes = await work.Lookups.ItemTypesAsync(cancellationToken);
        var priorityLevels = await work.Lookups.PriorityLevelsAsync(cancellationToken);
        var fields = await work.Fields.DefinitionsAsync(cancellationToken);
        var choices = await work.Fields.AllChoicesAsync(cancellationToken);

        return new ExportCatalogue(itemTypes, priorityLevels, fields, choices);
    }

    public string? TypeName(Guid? id)
    {
        return id is Guid key ? typesById[key].Name : null;
    }

    public string? PriorityName(Guid? id)
    {
        return id is Guid key ? prioritiesById[key].Name : null;
    }

    public string ChoiceLabel(Guid id)
    {
        return choicesById[id].Label;
    }

    public IReadOnlyList<FieldChoice> ChoicesOf(Guid fieldId)
    {
        return Choices.Where(choice => choice.FieldDefinitionId == fieldId).ToList();
    }
}