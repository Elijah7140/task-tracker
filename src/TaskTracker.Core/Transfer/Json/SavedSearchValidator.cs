using TaskTracker.Core.SavedSearches;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>Checks the saved searches of an import document and that their scopes point into the file.</summary>
internal sealed class SavedSearchValidator(ImportIndex index, IssueList issues)
{
    public void Validate(IReadOnlyList<SavedSearchDocument>? searches)
    {
        var list = searches.OrEmpty();
        var ids = new HashSet<Guid>();

        for (var position = 0; position < list.Count; position++)
        {
            var path = ImportChecks.Element("$.savedSearches", position);
            ValidateSearch(list[position], path, ids);
        }
    }

    private void ValidateSearch(SavedSearchDocument search, string path, HashSet<Guid> ids)
    {
        ImportChecks.CheckId(search.Id, $"{path}.id", ids, issues);
        ImportChecks.CheckName(search.Name, SavedSearch.NameMaxLength, $"{path}.name", issues);
        CheckQueryText(search.QueryText, $"{path}.queryText");
        TimestampChecks.Check(search.CreatedAtUtc, $"{path}.createdAtUtc", issues);
        TimestampChecks.Check(search.UpdatedAtUtc, $"{path}.updatedAtUtc", issues);
        CheckScope(search, path);
    }

    private void CheckQueryText(string? queryText, string path)
    {
        if (queryText is null)
        {
            issues.Add(path, "The query text is required (it may be empty).");
        }
        else if (queryText.Length > SavedSearch.QueryTextMaxLength)
        {
            issues.Add(path, $"The query text must be {SavedSearch.QueryTextMaxLength} characters or fewer.");
        }
    }

    private void CheckScope(SavedSearchDocument search, string path)
    {
        if (!ImportChecks.TryParseScopeKind(search.ScopeKind, out var kind))
        {
            issues.Add($"{path}.scopeKind", "The scope must be AllProjects, Project or Folder.");
            return;
        }

        if (kind != SavedSearchScopeKind.AllProjects)
        {
            CheckProjectAndFolder(search, path);
        }
    }

    private void CheckProjectAndFolder(SavedSearchDocument search, string path)
    {
        if (search.ProjectId is not Guid projectId || !index.ProjectIds.Contains(projectId))
        {
            issues.Add($"{path}.projectId", "The search's project must be one of the projects in this file.");
            return;
        }

        if (search.FolderId is Guid folderId && index.ProjectOfFolder(folderId) != projectId)
        {
            issues.Add($"{path}.folderId", "The search's folder must be in the search's project.");
        }
    }
}