using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>Turns one project's rows into its JSON document, in a stable order.</summary>
internal sealed class ProjectDocumentBuilder(ExportCatalogue catalogue)
{
    public ProjectDocument Build(ProjectExportData data)
    {
        var project = data.Project;

        return new ProjectDocument
        {
            Id = project.Id,
            Name = project.Name,
            Description = project.Description,
            SortOrder = project.SortOrder,
            CreatedAtUtc = TransferTimeFormat.FormatUtc(project.CreatedAtUtc),
            UpdatedAtUtc = TransferTimeFormat.FormatUtc(project.UpdatedAtUtc),
            Settings = new SortedDictionary<string, string>(data.Settings.ToDictionary(), StringComparer.Ordinal),
            Folders = BuildFolders(data.Folders),
            Items = BuildItems(data)
        };
    }

    private static List<FolderDocument> BuildFolders(IReadOnlyList<Folder> folders)
    {
        var ordered = folders
            .OrderBy(folder => folder.SortOrder)
            .ThenBy(folder => folder.CreatedAtUtc)
            .ThenBy(folder => folder.Name, StringComparer.Ordinal)
            .ThenBy(folder => folder.Id);

        return ordered.Select(BuildFolder).ToList();
    }

    private static FolderDocument BuildFolder(Folder folder)
    {
        return new FolderDocument
        {
            Id = folder.Id,
            ParentFolderId = folder.ParentFolderId,
            Name = folder.Name,
            SortOrder = folder.SortOrder,
            CreatedAtUtc = TransferTimeFormat.FormatUtc(folder.CreatedAtUtc),
            UpdatedAtUtc = TransferTimeFormat.FormatUtc(folder.UpdatedAtUtc)
        };
    }

    private List<ItemDocument> BuildItems(ProjectExportData data)
    {
        var valuesByItem = data.Values.ToLookup(value => value.ItemId);
        var linksByItem = data.Links.ToLookup(link => link.ItemId);
        var ordered = data.Items
            .OrderBy(item => item.SortOrder)
            .ThenBy(item => item.CreatedAtUtc)
            .ThenBy(item => item.Title, StringComparer.Ordinal)
            .ThenBy(item => item.Id);

        return ordered.Select(item => BuildItem(item, valuesByItem[item.Id], linksByItem[item.Id])).ToList();
    }

    private ItemDocument BuildItem(TodoItem item, IEnumerable<ItemFieldValue> values, IEnumerable<ItemLink> links)
    {
        return new ItemDocument
        {
            Id = item.Id,
            FolderId = item.FolderId,
            ParentItemId = item.ParentItemId,
            Title = item.Title,
            Description = item.Description,
            TicketNumber = item.TicketNumber,
            ItemTypeId = item.ItemTypeId,
            ItemType = catalogue.TypeName(item.ItemTypeId),
            StatusId = item.StatusId,
            ReopenStatusId = item.ReopenStatusId,
            PriorityLevelId = item.PriorityLevelId,
            Priority = catalogue.PriorityName(item.PriorityLevelId),
            DueDate = item.DueDate is DateOnly dueDate ? TransferTimeFormat.FormatDate(dueDate) : null,
            DueTime = item.DueTime is TimeOnly dueTime ? TransferTimeFormat.FormatTime(dueTime) : null,
            ScheduledStart = FormatLocal(item.ScheduledStart),
            ScheduledEnd = FormatLocal(item.ScheduledEnd),
            CompletedAtUtc = FormatUtc(item.CompletedAtUtc),
            SortOrder = item.SortOrder,
            CreatedAtUtc = TransferTimeFormat.FormatUtc(item.CreatedAtUtc),
            UpdatedAtUtc = TransferTimeFormat.FormatUtc(item.UpdatedAtUtc),
            FieldValues = BuildValues(values),
            ReminderMode = item.ReminderMode,
            ReminderOffsetMinutes = item.ReminderOffsetMinutes,
            Recurrence = item.Recurrence,
            RecurrenceSeriesId = item.RecurrenceSeriesId,
            RecurrenceSuccessorCreated = item.RecurrenceSuccessorCreated,
            Links = BuildLinks(links)
        };
    }

    /// <summary>The links in order, or null when there are none so the property is left out of the file.</summary>
    private static List<ItemLinkDocument>? BuildLinks(IEnumerable<ItemLink> links)
    {
        var documents = links.OrderBy(link => link.SortOrder)
            .Select(link => new ItemLinkDocument { Url = link.Url, Title = link.Title })
            .ToList();

        return documents.Count == 0 ? null : documents;
    }

    private List<FieldValueDocument> BuildValues(IEnumerable<ItemFieldValue> values)
    {
        var ordered = values.OrderBy(value => catalogue.FieldsById[value.FieldDefinitionId].Key, StringComparer.Ordinal);

        return ordered.Select(BuildValue).ToList();
    }

    private FieldValueDocument BuildValue(ItemFieldValue value)
    {
        return new FieldValueDocument
        {
            FieldKey = catalogue.FieldsById[value.FieldDefinitionId].Key,
            Text = value.TextValue,
            Number = value.NumberValue,
            Date = value.DateValue is DateOnly date ? TransferTimeFormat.FormatDate(date) : null,
            Boolean = value.BoolValue,
            ChoiceId = value.ChoiceId,
            ChoiceLabel = value.ChoiceId is Guid choiceId ? catalogue.ChoiceLabel(choiceId) : null
        };
    }

    private static string? FormatLocal(DateTime? value)
    {
        return value is DateTime local ? TransferTimeFormat.FormatLocal(local) : null;
    }

    private static string? FormatUtc(DateTime? value)
    {
        return value is DateTime utc ? TransferTimeFormat.FormatUtc(utc) : null;
    }
}