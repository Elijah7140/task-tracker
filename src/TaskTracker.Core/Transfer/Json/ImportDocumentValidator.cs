using TaskTracker.Core.Projects;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>
/// Checks a whole import document without touching the database: references, §5.1 invariants and
/// §7.1 value rules. Every problem is reported with its JSON path.
/// </summary>
internal static class ImportDocumentValidator
{
    public static IReadOnlyList<TransferIssue> Validate(ExportDocument document)
    {
        var issues = new IssueList();
        var index = new ImportIndex(document);

        LookupValidator.Validate(document.ItemTypes, "$.itemTypes", issues);
        LookupValidator.ValidatePriorityLevels(document.PriorityLevels, "$.priorityLevels", issues);
        LookupValidator.ValidateStatuses(document.Statuses, "$.statuses", issues);
        new FieldDocumentValidator(index, issues).Validate(document.Fields);
        ValidateProjects(document, index, issues);
        new SavedSearchValidator(index, issues).Validate(document.SavedSearches);

        return issues.Items;
    }

    private static void ValidateProjects(ExportDocument document, ImportIndex index, IssueList issues)
    {
        var projectIds = new HashSet<Guid>();
        var folderIds = new HashSet<Guid>();
        var itemIds = new HashSet<Guid>();
        var folderValidator = new FolderValidator(issues, folderIds);
        var itemValidator = new ItemValidator(index, issues, itemIds);
        var projects = document.Projects.OrEmpty();

        for (var position = 0; position < projects.Count; position++)
        {
            var path = ImportChecks.Element("$.projects", position);
            ValidateProjectHeader(projects[position], path, projectIds, issues);
            folderValidator.Validate(projects[position].Folders.OrEmpty(), $"{path}.folders");
            itemValidator.Validate(projects[position], $"{path}.items");
        }
    }

    private static void ValidateProjectHeader(ProjectDocument project, string path, HashSet<Guid> projectIds,
        IssueList issues)
    {
        ImportChecks.CheckId(project.Id, $"{path}.id", projectIds, issues);
        ImportChecks.CheckName(project.Name, Project.NameMaxLength, $"{path}.name", issues);
        TimestampChecks.Check(project.CreatedAtUtc, $"{path}.createdAtUtc", issues);
        TimestampChecks.Check(project.UpdatedAtUtc, $"{path}.updatedAtUtc", issues);
        SettingsValidator.Validate(project.Settings, $"{path}.settings", issues);
    }
}