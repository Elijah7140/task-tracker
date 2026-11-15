using TaskTracker.Core.Fields;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Persistence;

namespace TaskTracker.Core.Transfer.Csv;

/// <summary>What a CSV import can match its cells against: the lookups and the custom fields of the target project.</summary>
internal sealed class CsvImportContext
{
    private readonly ILookup<Guid, FieldChoice> choicesByField;

    private CsvImportContext(
        IReadOnlyList<ItemType> itemTypes,
        IReadOnlyList<PriorityLevel> priorityLevels,
        IReadOnlyList<FieldDefinition> fields,
        IReadOnlyList<FieldChoice> choices)
    {
        ItemTypes = itemTypes;
        PriorityLevels = priorityLevels;
        Fields = fields;
        choicesByField = choices.Where(choice => !choice.IsArchived).ToLookup(choice => choice.FieldDefinitionId);
    }

    public IReadOnlyList<ItemType> ItemTypes { get; }

    public IReadOnlyList<PriorityLevel> PriorityLevels { get; }

    /// <summary>The active fields the project's items can hold: global ones and the project's own.</summary>
    public IReadOnlyList<FieldDefinition> Fields { get; }

    public IReadOnlyList<FieldChoice> ActiveChoicesOf(Guid fieldId)
    {
        return choicesByField[fieldId].ToList();
    }

    /// <summary>Loads the context; throws when the project, or the folder inside it, is missing or deleted.</summary>
    public static async Task<CsvImportContext> LoadAsync(
        IUnitOfWork work, Guid projectId, Guid? folderId, CancellationToken cancellationToken)
    {
        await EnsureTargetExistsAsync(work, projectId, folderId, cancellationToken);
        var itemTypes = await work.Lookups.ItemTypesAsync(cancellationToken);
        var priorityLevels = await work.Lookups.PriorityLevelsAsync(cancellationToken);
        var definitions = await work.Fields.DefinitionsAsync(cancellationToken);
        var choices = await work.Fields.AllChoicesAsync(cancellationToken);
        var fields = definitions
            .Where(field => !field.IsArchived && (field.ProjectId is null || field.ProjectId == projectId))
            .ToList();

        return new CsvImportContext(itemTypes, priorityLevels, fields, choices);
    }

    private static async Task EnsureTargetExistsAsync(
        IUnitOfWork work, Guid projectId, Guid? folderId, CancellationToken cancellationToken)
    {
        if (await work.Projects.FindAsync(projectId, false, cancellationToken) is null)
        {
            throw new DomainRuleException("Project is missing or deleted.");
        }

        if (folderId is null)
        {
            return;
        }

        var folders = await work.Folders.ListAsync(projectId, false, cancellationToken);

        if (!folders.Any(folder => folder.Id == folderId))
        {
            throw new DomainRuleException("Folder is missing or deleted.");
        }
    }
}