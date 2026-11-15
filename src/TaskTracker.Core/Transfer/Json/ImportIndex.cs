namespace TaskTracker.Core.Transfer.Json;

/// <summary>Lookup tables over an import document, shared by the validators and the writers.</summary>
internal sealed class ImportIndex
{
    private readonly ExportDocument document;
    private readonly Dictionary<string, FieldDocument> fieldsByKey = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<Guid, Guid> projectOfFolder = [];

    public ImportIndex(ExportDocument document)
    {
        this.document = document;

        foreach (var field in document.Fields.OrEmpty())
        {
            if (!string.IsNullOrWhiteSpace(field.Key))
            {
                fieldsByKey.TryAdd(field.Key.Trim(), field);
            }
        }

        IndexProjects(document);
    }

    public HashSet<Guid> ProjectIds { get; } = [];

    /// <summary>The field definition with this key, or null.</summary>
    public FieldDocument? FindField(string? key)
    {
        return key is not null && fieldsByKey.TryGetValue(key.Trim(), out var field) ? field : null;
    }

    /// <summary>The project a folder belongs to, or null when the folder is not in the document.</summary>
    public Guid? ProjectOfFolder(Guid folderId)
    {
        return projectOfFolder.TryGetValue(folderId, out var projectId) ? projectId : null;
    }

    /// <summary>The item type an item refers to: by id when it has one, otherwise by name.</summary>
    public LookupDocument? FindItemType(ItemDocument item)
    {
        return FindLookup(document.ItemTypes.OrEmpty(), item.ItemTypeId, item.ItemType);
    }

    /// <summary>The priority level an item refers to: by id when it has one, otherwise by name.</summary>
    public LookupDocument? FindPriority(ItemDocument item)
    {
        return FindLookup(document.PriorityLevels.OrEmpty(), item.PriorityLevelId, item.Priority);
    }

    /// <summary>The choice a value refers to, by id when it has one, otherwise by label (active choices first).</summary>
    public ChoiceDocument? FindChoice(FieldDocument field, FieldValueDocument value)
    {
        var choices = field.Choices.OrEmpty();

        if (value.ChoiceId is Guid id)
        {
            return choices.FirstOrDefault(choice => choice.Id == id);
        }

        return choices
            .Where(choice => string.Equals(choice.Label?.Trim(), value.ChoiceLabel?.Trim(), StringComparison.OrdinalIgnoreCase))
            .OrderBy(choice => choice.IsArchived == true)
            .FirstOrDefault();
    }

    private static LookupDocument? FindLookup(IReadOnlyList<LookupDocument> lookups, Guid? id, string? name)
    {
        if (id is Guid key)
        {
            return lookups.FirstOrDefault(lookup => lookup.Id == key);
        }

        return lookups.FirstOrDefault(lookup =>
            string.Equals(lookup.Name?.Trim(), name?.Trim(), StringComparison.OrdinalIgnoreCase));
    }

    private void IndexProjects(ExportDocument source)
    {
        foreach (var project in source.Projects.OrEmpty())
        {
            if (project.Id is Guid projectId)
            {
                ProjectIds.Add(projectId);
                IndexFolders(project, projectId);
            }
        }
    }

    private void IndexFolders(ProjectDocument project, Guid projectId)
    {
        foreach (var folder in project.Folders.OrEmpty())
        {
            if (folder.Id is Guid folderId)
            {
                projectOfFolder.TryAdd(folderId, projectId);
            }
        }
    }
}