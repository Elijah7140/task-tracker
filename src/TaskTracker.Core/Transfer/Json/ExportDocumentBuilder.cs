using TaskTracker.Core.Fields;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.SavedSearches;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>Reads the database through one unit of work and assembles the export document (§7.9).</summary>
internal sealed class ExportDocumentBuilder(TimeProvider clock)
{
    public async Task<ExportDocument> BuildAsync(
        IUnitOfWork work, TransferScope scope, CancellationToken cancellationToken)
    {
        var projects = await ProjectExportLoader.LoadAsync(work, scope, cancellationToken);
        var catalogue = await ExportCatalogue.LoadAsync(work, cancellationToken);
        var projectBuilder = new ProjectDocumentBuilder(catalogue);
        var wholeDatabase = scope is TransferScope.AllData;
        var usedFieldIds = projects.SelectMany(project => project.Values).Select(value => value.FieldDefinitionId).ToHashSet();
        var globalSettings = wholeDatabase ? await GlobalSettingsAsync(work, cancellationToken) : null;
        var savedSearches = await BuildSavedSearchesAsync(work, projects, wholeDatabase, cancellationToken);

        return new ExportDocument
        {
            Format = ExportDocument.FormatName,
            Version = ExportDocument.CurrentVersion,
            ExportedAtUtc = TransferTimeFormat.FormatUtc(clock.GetUtcNow().UtcDateTime),
            Scope = wholeDatabase ? ExportDocument.AllScope : ExportDocument.ProjectScope,
            ItemTypes = BuildItemTypes(catalogue, projects, wholeDatabase),
            PriorityLevels = BuildPriorityLevels(catalogue, projects, wholeDatabase),
            Statuses = BuildStatuses(catalogue, projects, wholeDatabase),
            Fields = BuildFields(catalogue, projects, usedFieldIds, wholeDatabase),
            GlobalSettings = globalSettings,
            Projects = projects.Select(projectBuilder.Build).ToList(),
            SavedSearches = savedSearches
        };
    }

    private static List<LookupDocument> BuildItemTypes(
        ExportCatalogue catalogue, IReadOnlyList<ProjectExportData> projects, bool wholeDatabase)
    {
        var used = projects.SelectMany(project => project.Items).Select(item => item.ItemTypeId).ToHashSet();
        var selected = catalogue.ItemTypes.Where(type => wholeDatabase || used.Contains(type.Id));

        return selected.OrderBy(type => type.SortOrder).Select(BuildItemType).ToList();
    }

    private static LookupDocument BuildItemType(ItemType type)
    {
        return new LookupDocument
        {
            Id = type.Id,
            Name = type.Name,
            ColorKey = type.ColorKey,
            IconKey = type.IconKey,
            IsBuiltIn = type.IsBuiltIn,
            IsArchived = type.IsArchived,
            SortOrder = type.SortOrder
        };
    }

    private static List<LookupDocument> BuildPriorityLevels(
        ExportCatalogue catalogue, IReadOnlyList<ProjectExportData> projects, bool wholeDatabase)
    {
        var used = projects.SelectMany(project => project.Items).Select(item => item.PriorityLevelId).ToHashSet();
        var selected = catalogue.PriorityLevels.Where(level => wholeDatabase || used.Contains(level.Id));

        return selected.OrderBy(level => level.SortOrder).Select(BuildPriorityLevel).ToList();
    }

    private static LookupDocument BuildPriorityLevel(PriorityLevel level)
    {
        return new LookupDocument
        {
            Id = level.Id,
            Name = level.Name,
            Number = level.Number,
            ColorKey = level.ColorKey,
            IsBuiltIn = level.IsBuiltIn,
            IsArchived = level.IsArchived,
            SortOrder = level.SortOrder
        };
    }

    private static List<LookupDocument> BuildStatuses(
        ExportCatalogue catalogue, IReadOnlyList<ProjectExportData> projects, bool wholeDatabase)
    {
        var items = projects.SelectMany(project => project.Items).ToList();
        var used = items.Select(item => item.StatusId).Concat(items.Select(item => item.ReopenStatusId)).ToHashSet();
        var selected = catalogue.Statuses.Where(status => wholeDatabase || used.Contains(status.Id));

        return selected.OrderBy(status => status.SortOrder).Select(BuildStatus).ToList();
    }

    private static LookupDocument BuildStatus(StatusLevel status)
    {
        return new LookupDocument
        {
            Id = status.Id,
            Name = status.Name,
            Kind = status.Kind == StatusKind.Done ? "done" : "open",
            IsArchived = status.IsArchived,
            SortOrder = status.SortOrder
        };
    }

    private static List<FieldDocument> BuildFields(
        ExportCatalogue catalogue, IReadOnlyList<ProjectExportData> projects,
        HashSet<Guid> usedFieldIds, bool wholeDatabase)
    {
        var projectIds = projects.Select(project => project.Project.Id).ToHashSet();
        var selected = catalogue.Fields.Where(field => IsExportedField(field, projectIds, usedFieldIds, wholeDatabase));

        return selected.OrderBy(field => field.SortOrder).ThenBy(field => field.Key, StringComparer.Ordinal)
            .Select(field => BuildField(field, catalogue.ChoicesOf(field.Id)))
            .ToList();
    }

    private static bool IsExportedField(
        FieldDefinition field, HashSet<Guid> projectIds, HashSet<Guid> usedFieldIds, bool wholeDatabase)
    {
        if (field.ProjectId is Guid projectId)
        {
            return projectIds.Contains(projectId);
        }

        return wholeDatabase || usedFieldIds.Contains(field.Id);
    }

    private static FieldDocument BuildField(FieldDefinition field, IReadOnlyList<FieldChoice> choices)
    {
        return new FieldDocument
        {
            Id = field.Id,
            Key = field.Key,
            DisplayName = field.DisplayName,
            DataType = field.DataType.ToString(),
            ProjectId = field.ProjectId,
            IsArchived = field.IsArchived,
            SortOrder = field.SortOrder,
            Choices = choices.Select(BuildChoice).ToList()
        };
    }

    private static ChoiceDocument BuildChoice(FieldChoice choice)
    {
        return new ChoiceDocument
        {
            Id = choice.Id,
            Label = choice.Label,
            SortOrder = choice.SortOrder,
            IsArchived = choice.IsArchived
        };
    }

    private static async Task<SortedDictionary<string, string>> GlobalSettingsAsync(
        IUnitOfWork work, CancellationToken cancellationToken)
    {
        var settings = await work.Settings.GetGlobalAsync(cancellationToken);

        return new SortedDictionary<string, string>(settings.ToDictionary(), StringComparer.Ordinal);
    }

    private static async Task<List<SavedSearchDocument>> BuildSavedSearchesAsync(
        IUnitOfWork work, IReadOnlyList<ProjectExportData> projects, bool wholeDatabase,
        CancellationToken cancellationToken)
    {
        var searches = await work.SavedSearches.ListAsync(cancellationToken);
        var projectIds = projects.Select(project => project.Project.Id).ToHashSet();
        var folderIds = projects.SelectMany(project => project.Folders).Select(folder => folder.Id).ToHashSet();
        var selected = searches.Where(search => IsExportedSearch(search, projectIds, folderIds, wholeDatabase));

        return selected.Select(BuildSavedSearch).ToList();
    }

    private static bool IsExportedSearch(
        SavedSearch search, HashSet<Guid> projectIds, HashSet<Guid> folderIds, bool wholeDatabase)
    {
        if (search.ScopeKind == SavedSearchScopeKind.AllProjects)
        {
            return wholeDatabase;
        }

        var projectIsExported = search.ProjectId is Guid projectId && projectIds.Contains(projectId);
        var folderIsExported = search.FolderId is null || folderIds.Contains(search.FolderId.Value);

        return projectIsExported && folderIsExported;
    }

    private static SavedSearchDocument BuildSavedSearch(SavedSearch search)
    {
        return new SavedSearchDocument
        {
            Id = search.Id,
            Name = search.Name,
            QueryText = search.QueryText,
            ScopeKind = search.ScopeKind.ToString(),
            ProjectId = search.ProjectId,
            FolderId = search.FolderId,
            IncludeSubfolders = search.IncludeSubfolders,
            IncludeCompleted = search.IncludeCompleted,
            SortOrder = search.SortOrder,
            CreatedAtUtc = TransferTimeFormat.FormatUtc(search.CreatedAtUtc),
            UpdatedAtUtc = TransferTimeFormat.FormatUtc(search.UpdatedAtUtc)
        };
    }
}