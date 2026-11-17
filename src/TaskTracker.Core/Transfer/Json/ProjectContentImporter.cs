using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Projects;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>Creates the folders, items and custom values of an imported project, all with new ids.</summary>
internal sealed class ProjectContentImporter(
    IUnitOfWork work, TimeProvider clock, ImportIndex index, ImportMap map)
{
    private readonly Dictionary<Guid, Guid> itemIds = [];

    /// <summary>Adds the project's folders and items to the unit of work and returns the counts.</summary>
    public (int Folders, int Items) Import(ImportedProject imported)
    {
        var projectId = imported.Project.Id;
        var folders = CreateFolders(imported.Document.Folders.OrEmpty(), projectId);
        var items = CreateItems(imported.Document.Items.OrEmpty(), projectId);

        if (imported.EffectiveSettings?.AutoCompleteParents.Value == true)
        {
            ImportCompletion.Reconcile(projectId, folders, items, clock);
        }

        return (folders.Count, items.Count);
    }

    private List<Folder> CreateFolders(IReadOnlyList<FolderDocument> documents, Guid projectId)
    {
        var created = new List<Folder>();

        foreach (var document in ParentFirst(documents, folder => folder.Id, folder => folder.ParentFolderId))
        {
            var parentId = document.ParentFolderId is Guid parent ? map.Folders[parent] : (Guid?)null;
            var folder = Folder.Create(projectId, parentId, document.Name!, clock, document.SortOrder ?? 0);
            var createdAt = ImportTimestamps.Created(document.CreatedAtUtc, clock);
            folder.RestoreTimestamps(createdAt, ImportTimestamps.Updated(document.UpdatedAtUtc, document.CreatedAtUtc, clock));
            work.Folders.Add(folder);
            map.Folders[document.Id!.Value] = folder.Id;
            created.Add(folder);
        }

        return created;
    }

    private List<TodoItem> CreateItems(IReadOnlyList<ItemDocument> documents, Guid projectId)
    {
        var created = new List<TodoItem>();

        foreach (var document in ParentFirst(documents, item => item.Id, item => item.ParentItemId))
        {
            var item = CreateItem(document, projectId);
            work.Items.Add(item);
            itemIds[document.Id!.Value] = item.Id;
            created.Add(item);
            AddValues(item, document);
            AddLinks(item, document);
        }

        return created;
    }

    private TodoItem CreateItem(ItemDocument document, Guid projectId)
    {
        var folderId = document.FolderId is Guid folder ? map.Folders[folder] : (Guid?)null;
        var parentId = document.ParentItemId is Guid parent ? itemIds[parent] : (Guid?)null;
        var item = TodoItem.Create(projectId, folderId, parentId, document.Title!, clock, document.SortOrder ?? 0);

        ApplyFields(item, document);
        var createdAt = ImportTimestamps.Created(document.CreatedAtUtc, clock);
        item.RestoreTimestamps(createdAt, ImportTimestamps.Updated(document.UpdatedAtUtc, document.CreatedAtUtc, clock));

        return item;
    }

    private void ApplyFields(TodoItem item, ItemDocument document)
    {
        if (document.Description is not null)
        {
            item.SetDescription(document.Description, clock);
        }

        item.SetTicketNumber(document.TicketNumber, clock);
        item.SetLookups(ItemTypeId(document), PriorityId(document), clock);
        item.SetDue(ImportParse.Date(document.DueDate), ImportParse.Time(document.DueTime), clock);
        item.SetSchedule(ImportParse.Local(document.ScheduledStart), ImportParse.Local(document.ScheduledEnd), clock);

        item.SetReminder(document.ReminderMode, document.ReminderOffsetMinutes);
        if (document.Recurrence is { } rule)
        {
            item.SetRecurrence(rule, clock, MapSeries(document.RecurrenceSeriesId));
        }

        if (ImportParse.Utc(document.CompletedAtUtc) is DateTime completedAt)
        {
            item.SetCompletion(completedAt, clock);
        }
    }

    private Guid? MapSeries(Guid? original)
    {
        if (original is not Guid id)
        {
            return null;
        }

        if (!map.RecurrenceSeries.TryGetValue(id, out var mapped))
        {
            mapped = Guid.CreateVersion7();
            map.RecurrenceSeries.Add(id, mapped);
        }

        return mapped;
    }

    private Guid? ItemTypeId(ItemDocument document)
    {
        return index.FindItemType(document)?.Id is Guid id ? map.ItemTypes[id] : null;
    }

    private Guid? PriorityId(ItemDocument document)
    {
        return index.FindPriority(document)?.Id is Guid id ? map.PriorityLevels[id] : null;
    }

    private void AddLinks(TodoItem item, ItemDocument document)
    {
        var links = document.Links.OrEmpty();

        for (var position = 0; position < links.Count; position++)
        {
            var input = new ItemLinkInput(null, links[position].Url!, links[position].Title);
            work.Items.Add(ItemLink.Create(item.Id, input, position, clock));
        }
    }

    private void AddValues(TodoItem item, ItemDocument document)
    {
        foreach (var value in document.FieldValues.OrEmpty())
        {
            var field = map.Fields[value.FieldKey!.Trim()];
            var input = CreateInput(field, value);
            work.Fields.Add(ItemFieldValue.Create(item.Id, input));
        }
    }

    private FieldValueInput CreateInput(FieldDefinition field, FieldValueDocument value)
    {
        var fieldDocument = index.FindField(value.FieldKey)!;
        var choice = index.FindChoice(fieldDocument, value);
        Guid? choiceId = choice?.Id is Guid documentChoiceId ? map.Choices[documentChoiceId] : null;

        return new FieldValueInput(
            field.Id, value.Text, value.Number, ImportParse.Date(value.Date), value.Boolean, choiceId);
    }

    /// <summary>
    /// Orders documents so every parent comes before its children, in one pass from the roots down.
    /// The file has already been checked for cycles and missing parents, so every document is reached.
    /// </summary>
    private static List<T> ParentFirst<T>(IReadOnlyList<T> documents, Func<T, Guid?> idOf, Func<T, Guid?> parentOf)
    {
        var childrenOf = documents.ToLookup(parentOf);
        var ordered = new List<T>(documents.Count);
        var waiting = new Queue<T>(childrenOf[null]);

        while (waiting.Count > 0)
        {
            var document = waiting.Dequeue();
            ordered.Add(document);

            foreach (var child in childrenOf[idOf(document)])
            {
                waiting.Enqueue(child);
            }
        }

        return ordered;
    }
}