using TaskTracker.Core.Fields;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Search;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>
/// Matches the file's global fields to existing ones by key (ignoring case) and creates the rest,
/// along with every project field. Choices of a matched field are matched by label.
/// </summary>
internal sealed class FieldImporter(IUnitOfWork work, ImportMap map, IssueList issues)
{
    private readonly List<FieldDefinition> fields = [];
    private readonly List<FieldChoice> choices = [];
    private readonly HashSet<string> usedKeys = new(StringComparer.OrdinalIgnoreCase);

    public async Task ImportAsync(ExportDocument document, CancellationToken cancellationToken)
    {
        fields.AddRange(await work.Fields.DefinitionsAsync(cancellationToken));
        choices.AddRange(await work.Fields.AllChoicesAsync(cancellationToken));
        usedKeys.UnionWith(fields.Select(field => field.Key));
        usedKeys.UnionWith(BuiltInSearchKeys.Reserved);

        var documents = document.Fields.OrEmpty();
        var inOrder = Enumerable.Range(0, documents.Count)
            .OrderBy(position => documents[position].ProjectId is null ? 0 : 1)
            .ThenBy(position => documents[position].SortOrder ?? 0)
            .ThenBy(position => position);

        foreach (var position in inOrder)
        {
            ImportField(documents[position], ImportChecks.Element("$.fields", position));
        }
    }

    private void ImportField(FieldDocument document, string path)
    {
        ImportChecks.TryParseDataType(document.DataType, out var type);
        var projectId = document.ProjectId is Guid documentProjectId ? map.Projects[documentProjectId] : (Guid?)null;
        var match = projectId is null ? FindGlobal(document.Key!) : null;

        if (match is null)
        {
            CreateField(document, type, projectId);
        }
        else if (match.DataType != type)
        {
            issues.Add($"{path}.dataType", $"A field with the key '{match.Key}' already exists with type {match.DataType}.");
        }
        else
        {
            map.Fields[document.Key!.Trim()] = match;
            MatchChoices(document, match);
        }
    }

    private FieldDefinition? FindGlobal(string key)
    {
        return fields.FirstOrDefault(field => field.ProjectId is null
            && string.Equals(field.Key, key.Trim(), StringComparison.OrdinalIgnoreCase));
    }

    private void CreateField(FieldDocument document, FieldDataType type, Guid? projectId)
    {
        var field = FieldDefinition.CreateImported(
            document.Key!, UniqueDisplayName(document, projectId), type, projectId,
            NextSortOrder(document, projectId), document.IsArchived == true, usedKeys);

        work.Fields.Add(field);
        fields.Add(field);
        usedKeys.Add(field.Key);
        map.Fields[document.Key!.Trim()] = field;

        foreach (var choice in document.Choices.OrEmpty())
        {
            CreateChoice(field, choice, choice.SortOrder ?? 0);
        }
    }

    private string UniqueDisplayName(FieldDocument document, Guid? projectId)
    {
        if (document.IsArchived == true)
        {
            return document.DisplayName!.Trim();
        }

        return ImportedName.Unique(document.DisplayName!, name => IsVisibleActiveName(name, projectId),
            FieldDefinition.NameMaxLength);
    }

    private bool IsVisibleActiveName(string name, Guid? projectId)
    {
        return fields.Any(field => !field.IsArchived
            && (field.ProjectId is null || projectId is null || field.ProjectId == projectId)
            && string.Equals(field.DisplayName, name, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>A project field keeps its exported position; a new global field goes after the existing ones.</summary>
    private int NextSortOrder(FieldDocument document, Guid? projectId)
    {
        if (projectId is not null)
        {
            return document.SortOrder ?? 0;
        }

        var globalOrders = fields.Where(field => field.ProjectId is null).Select(field => field.SortOrder).ToList();

        return globalOrders.Count == 0 ? 0 : globalOrders.Max() + 1;
    }

    private void MatchChoices(FieldDocument document, FieldDefinition field)
    {
        foreach (var choiceDocument in document.Choices.OrEmpty())
        {
            var existing = choices.FirstOrDefault(choice => choice.FieldDefinitionId == field.Id
                && string.Equals(choice.Label, choiceDocument.Label?.Trim(), StringComparison.OrdinalIgnoreCase));

            existing ??= CreateChoice(field, choiceDocument, NextChoiceOrder(field));
            map.Choices[choiceDocument.Id!.Value] = existing.Id;
        }
    }

    private int NextChoiceOrder(FieldDefinition field)
    {
        var orders = choices.Where(choice => choice.FieldDefinitionId == field.Id).Select(choice => choice.SortOrder).ToList();

        return orders.Count == 0 ? 0 : orders.Max() + 1;
    }

    private FieldChoice CreateChoice(FieldDefinition field, ChoiceDocument document, int sortOrder)
    {
        var choice = FieldChoice.Create(field.Id, document.Label!, sortOrder);

        if (document.IsArchived == true)
        {
            choice.Archive();
        }

        work.Fields.Add(choice);
        choices.Add(choice);
        map.Choices[document.Id!.Value] = choice.Id;

        return choice;
    }
}