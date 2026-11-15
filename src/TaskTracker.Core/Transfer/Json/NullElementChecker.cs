namespace TaskTracker.Core.Transfer.Json;

/// <summary>
/// Finds <c>null</c> where a list should hold an object (<c>"projects":[null]</c>). The validators assume every
/// element exists, so this runs first and reports the position instead of letting them crash.
/// </summary>
internal static class NullElementChecker
{
    public static IReadOnlyList<TransferIssue> Find(ExportDocument document)
    {
        var issues = new IssueList();

        CheckList(document.ItemTypes, "$.itemTypes", issues);
        CheckList(document.PriorityLevels, "$.priorityLevels", issues);
        CheckList(document.SavedSearches, "$.savedSearches", issues);
        CheckFields(document.Fields, issues);
        CheckProjects(document.Projects, issues);

        return issues.Items;
    }

    private static void CheckFields(IReadOnlyList<FieldDocument>? fields, IssueList issues)
    {
        CheckList(fields, "$.fields", issues);

        for (var position = 0; position < fields.OrEmpty().Count; position++)
        {
            var path = ImportChecks.Element("$.fields", position);
            CheckList(fields![position]?.Choices, $"{path}.choices", issues);
        }
    }

    private static void CheckProjects(IReadOnlyList<ProjectDocument>? projects, IssueList issues)
    {
        CheckList(projects, "$.projects", issues);

        for (var position = 0; position < projects.OrEmpty().Count; position++)
        {
            var path = ImportChecks.Element("$.projects", position);
            CheckList(projects![position]?.Folders, $"{path}.folders", issues);
            CheckItems(projects[position]?.Items, $"{path}.items", issues);
        }
    }

    private static void CheckItems(IReadOnlyList<ItemDocument>? items, string path, IssueList issues)
    {
        CheckList(items, path, issues);

        for (var position = 0; position < items.OrEmpty().Count; position++)
        {
            var itemPath = ImportChecks.Element(path, position);
            CheckList(items![position]?.FieldValues, $"{itemPath}.fieldValues", issues);
        }
    }

    private static void CheckList<T>(IReadOnlyList<T?>? list, string path, IssueList issues)
        where T : class
    {
        var elements = list ?? [];

        for (var position = 0; position < elements.Count; position++)
        {
            if (elements[position] is null)
            {
                issues.Add(ImportChecks.Element(path, position), "must be an object");
            }
        }
    }
}