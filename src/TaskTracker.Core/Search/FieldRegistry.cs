using TaskTracker.Core.Fields;
using TaskTracker.Core.Persistence;

namespace TaskTracker.Core.Search;

/// <summary>Combines built-in fields with active custom definitions.</summary>
public sealed class FieldRegistry(IUnitOfWorkFactory factory) : IFieldRegistry
{
    private static readonly SearchableField[] BuiltIns =
    [
        new("title", "Title", FieldDataType.Text, null),
        new("ticket", "Ticket Number", FieldDataType.Text, null),
        new("type", "Type", FieldDataType.Choice, null),
        new("priority", "Priority", FieldDataType.Choice, null),
        new("due", "Due Date", FieldDataType.Date, null),
        new("scheduled", "Scheduled Date", FieldDataType.Date, null),
        new("status", "Completed", FieldDataType.Boolean, null),
        new("link", "Links", FieldDataType.Text, null),
        new("repeats", "Repeats", FieldDataType.Boolean, null),
        new("reminder", "Reminder", FieldDataType.Boolean, null)
    ];

    public async Task<IReadOnlyList<SearchableField>> GetFieldsAsync(
        SearchScope scope, CancellationToken cancellationToken = default)
    {
        await using var unit = factory.Begin();
        return await GetFieldsAsync(scope, unit, cancellationToken);
    }

    internal static async Task<IReadOnlyList<SearchableField>> GetFieldsAsync(
        SearchScope scope, IUnitOfWork unit, CancellationToken cancellationToken)
    {
        var definitions = await unit.Fields.DefinitionsAsync(cancellationToken);
        var activeProjects = await unit.Projects.ListAsync(false, cancellationToken);
        var fields = new List<SearchableField>(BuiltIns);
        var projectId = scope switch
        {
            SearchScope.Project project => project.ProjectId,
            SearchScope.Area area => area.ProjectId,
            _ => (Guid?)null
        };

        AddGlobalFields(fields, definitions);
        AddProjectFields(fields, definitions, activeProjects, projectId);

        return fields;
    }

    private static void AddGlobalFields(List<SearchableField> fields,
        IReadOnlyList<FieldDefinition> definitions)
    {
        foreach (var definition in definitions.Where(field => !field.IsArchived && field.ProjectId is null))
        {
            fields.Add(ToSearchable(definition));
        }
    }

    private static void AddProjectFields(List<SearchableField> fields,
        IReadOnlyList<FieldDefinition> definitions, IReadOnlyList<TaskTracker.Core.Projects.Project> projects,
        Guid? projectId)
    {
        var projectOrder = projects.ToDictionary(project => project.Id, project => project.SortOrder);
        var projectFields = definitions.Where(field => !field.IsArchived
            && field.ProjectId is Guid ownerId && projectOrder.ContainsKey(ownerId));
        var ordered = projectFields.OrderBy(field => projectOrder[field.ProjectId!.Value])
            .ThenBy(field => field.SortOrder).ThenBy(field => field.Key);

        foreach (var definition in ordered)
        {
            if (projectId is null || definition.ProjectId == projectId)
            {
                fields.Add(ToSearchable(definition));
            }
        }
    }

    public async Task<IReadOnlyList<SearchChoice>> GetChoicesAsync(
        SearchableField field, CancellationToken cancellationToken = default)
    {
        await using var unit = factory.Begin();
        return await GetChoicesAsync(field, unit, cancellationToken);
    }

    internal static async Task<IReadOnlyList<SearchChoice>> GetChoicesAsync(
        SearchableField field, IUnitOfWork unit, CancellationToken cancellationToken)
    {

        if (field.Key == "type" && field.IsBuiltIn)
        {
            return await TypeChoicesAsync(unit, cancellationToken);
        }

        if (field.Key == "priority" && field.IsBuiltIn)
        {
            return await PriorityChoicesAsync(unit, cancellationToken);
        }

        if (field.FieldDefinitionId is not Guid fieldId || field.DataType != FieldDataType.Choice)
        {
            return [];
        }

        var choices = await unit.Fields.ChoicesAsync(fieldId, cancellationToken);
        return choices.Where(choice => !choice.IsArchived)
            .Select(choice => new SearchChoice(choice.Id, choice.Label, choice.SortOrder)).ToList();
    }

    private static async Task<IReadOnlyList<SearchChoice>> TypeChoicesAsync(
        IUnitOfWork unit, CancellationToken cancellationToken)
    {
        var types = await unit.Lookups.ItemTypesAsync(cancellationToken);
        return types.Where(type => !type.IsArchived)
            .OrderBy(type => type.SortOrder)
            .Select(type => new SearchChoice(type.Id, type.Name, type.SortOrder)).ToList();
    }

    private static async Task<IReadOnlyList<SearchChoice>> PriorityChoicesAsync(
        IUnitOfWork unit, CancellationToken cancellationToken)
    {
        var levels = await unit.Lookups.PriorityLevelsAsync(cancellationToken);
        return levels.Where(level => !level.IsArchived)
            .OrderBy(level => level.SortOrder)
            .Select(level => new SearchChoice(level.Id, level.Name, level.SortOrder)).ToList();
    }

    private static SearchableField ToSearchable(FieldDefinition definition)
    {
        return new SearchableField(definition.Key, definition.DisplayName, definition.DataType, definition.Id);
    }
}