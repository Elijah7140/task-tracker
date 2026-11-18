using System.Globalization;

using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;

namespace TaskTracker.Core.Transfer.Csv;

/// <summary>
/// Writes items as a flat CSV table (§7.9): the fixed columns, then one column per custom field
/// named after its display name. Dates are ISO and invariant, so the file reads the same on every machine.
/// </summary>
internal sealed class CsvExporter(ExportCatalogue catalogue)
{
    private const string FolderSeparator = "/";

    /// <summary>
    /// Writes the items of the projects. With <paramref name="itemOrder"/> only those items are written,
    /// in that order (a search result); without it every item is written, project by project.
    /// </summary>
    public string Export(IReadOnlyList<ProjectExportData> projects, IReadOnlyList<Guid>? itemOrder)
    {
        var columns = FieldColumns(projects);
        var rows = new List<IReadOnlyList<string>> { HeaderRow(columns) };
        var rowsByProject = projects.ToDictionary(project => project.Project.Id, project => new ProjectRows(project));

        foreach (var (project, item) in SelectItems(projects, itemOrder))
        {
            rows.Add(ItemRow(rowsByProject[project.Project.Id], item, columns));
        }

        return CsvWriter.Write(rows);
    }

    private static IReadOnlyList<string> HeaderRow(IReadOnlyList<CsvFieldColumn> columns)
    {
        return [.. CsvColumns.Standard, .. columns.Select(column => column.Header)];
    }

    private static List<(ProjectExportData Project, TodoItem Item)> SelectItems(
        IReadOnlyList<ProjectExportData> projects, IReadOnlyList<Guid>? itemOrder)
    {
        if (itemOrder is null)
        {
            return projects.SelectMany(project => CsvItemOrder.Order(project).Select(item => (project, item))).ToList();
        }

        var byId = projects.SelectMany(project => project.Items.Select(item => (project, item)))
            .ToDictionary(pair => pair.item.Id);

        return itemOrder.Where(byId.ContainsKey).Select(id => byId[id]).ToList();
    }

    private List<CsvFieldColumn> FieldColumns(IReadOnlyList<ProjectExportData> projects)
    {
        var projectIds = projects.Select(project => project.Project.Id).ToHashSet();
        var usedFieldIds = projects.SelectMany(project => project.Values).Select(value => value.FieldDefinitionId).ToHashSet();
        var visible = catalogue.Fields
            .Where(field => field.ProjectId is null || projectIds.Contains(field.ProjectId.Value))
            .Where(field => !field.IsArchived || usedFieldIds.Contains(field.Id))
            .OrderBy(field => field.ProjectId is null ? 0 : 1)
            .ThenBy(field => field.SortOrder);

        return GroupByDisplayName(visible);
    }

    private static List<CsvFieldColumn> GroupByDisplayName(IEnumerable<FieldDefinition> fields)
    {
        var groups = new Dictionary<string, (string Header, HashSet<Guid> Ids)>(StringComparer.OrdinalIgnoreCase);

        foreach (var field in fields)
        {
            if (!groups.TryGetValue(field.DisplayName, out var group))
            {
                group = (CsvColumns.FieldHeader(field.DisplayName), []);
                groups[field.DisplayName] = group;
            }

            group.Ids.Add(field.Id);
        }

        return groups.Values.Select(group => new CsvFieldColumn(group.Header, group.Ids)).ToList();
    }

    private IReadOnlyList<string> ItemRow(ProjectRows rows, TodoItem item, IReadOnlyList<CsvFieldColumn> columns)
    {
        var cells = new List<string>
        {
            CsvCells.Protect(item.Title),
            CsvCells.Protect(item.Description ?? string.Empty),
            CsvCells.Protect(item.TicketNumber ?? string.Empty),
            CsvCells.Protect(catalogue.TypeName(item.ItemTypeId) ?? string.Empty),
            CsvCells.Protect(catalogue.PriorityLabel(item.PriorityLevelId) ?? string.Empty),
            CsvCells.Protect(catalogue.StatusName(item.StatusId) ?? string.Empty),
            Date(item.DueDate),
            Time(item.DueTime),
            Local(item.ScheduledStart),
            Local(item.ScheduledEnd),
            item.CompletedAtUtc is null ? "no" : "yes",
            Utc(item.CompletedAtUtc),
            CsvCells.Protect(rows.Project.Project.Name),
            CsvCells.Protect(rows.FolderPath(item)),
            CsvCells.Protect(rows.ParentTitle(item)),
            string.Join(" ", rows.LinksOf(item).Select(link => link.Url)),
            item.Recurrence?.Describe() ?? string.Empty
        };

        cells.AddRange(columns.Select(column => FieldCell(rows, item, column)));

        return cells;
    }

    private static string Date(DateOnly? date)
    {
        return date is null ? string.Empty : TransferTimeFormat.FormatDate(date.Value);
    }

    private static string Time(TimeOnly? time)
    {
        return time is null ? string.Empty : TransferTimeFormat.FormatTime(time.Value);
    }

    private static string Local(DateTime? value)
    {
        return value is null ? string.Empty : TransferTimeFormat.FormatLocal(value.Value);
    }

    private static string Utc(DateTime? value)
    {
        return value is null ? string.Empty : TransferTimeFormat.FormatUtc(value.Value);
    }

    private string FieldCell(ProjectRows rows, TodoItem item, CsvFieldColumn column)
    {
        var value = rows.ValuesOf(item).FirstOrDefault(candidate => column.FieldIds.Contains(candidate.FieldDefinitionId));

        return value is null ? string.Empty : FormatValue(catalogue.FieldsById[value.FieldDefinitionId], value);
    }

    private string FormatValue(FieldDefinition field, ItemFieldValue value)
    {
        return field.DataType switch
        {
            FieldDataType.Text => CsvCells.Protect(value.TextValue ?? string.Empty),
            FieldDataType.Number => value.NumberValue!.Value.ToString("R", CultureInfo.InvariantCulture),
            FieldDataType.Date => TransferTimeFormat.FormatDate(value.DateValue!.Value),
            FieldDataType.Boolean => value.BoolValue == true ? "yes" : "no",
            _ => CsvCells.Protect(catalogue.ChoiceLabel(value.ChoiceId!.Value))
        };
    }

    /// <summary>Folder paths, parent titles and custom values of one project, looked up by item.</summary>
    private sealed class ProjectRows
    {
        private readonly Dictionary<Guid, string> folderPaths = [];
        private readonly Dictionary<Guid, TodoItem> itemsById;
        private readonly ILookup<Guid, ItemFieldValue> valuesByItem;
        private readonly ILookup<Guid, ItemLink> linksByItem;

        public ProjectRows(ProjectExportData project)
        {
            Project = project;
            itemsById = project.Items.ToDictionary(item => item.Id);
            valuesByItem = project.Values.ToLookup(value => value.ItemId);
            linksByItem = project.Links.ToLookup(link => link.ItemId);
            var foldersById = project.Folders.ToDictionary(folder => folder.Id);

            foreach (var folder in project.Folders)
            {
                folderPaths[folder.Id] = PathOf(folder, foldersById);
            }
        }

        public ProjectExportData Project { get; }

        public string FolderPath(TodoItem item)
        {
            return item.FolderId is Guid folderId ? folderPaths[folderId] : string.Empty;
        }

        public string ParentTitle(TodoItem item)
        {
            return item.ParentItemId is Guid parentId ? itemsById[parentId].Title : string.Empty;
        }

        public IEnumerable<ItemLink> LinksOf(TodoItem item)
        {
            return linksByItem[item.Id].OrderBy(link => link.SortOrder);
        }

        public IEnumerable<ItemFieldValue> ValuesOf(TodoItem item)
        {
            return valuesByItem[item.Id];
        }

        private static string PathOf(Folder folder, Dictionary<Guid, Folder> foldersById)
        {
            var names = new List<string> { folder.Name };
            var current = folder;

            while (current.ParentFolderId is Guid parentId)
            {
                current = foldersById[parentId];
                names.Insert(0, current.Name);
            }

            return string.Join(FolderSeparator, names);
        }
    }
}