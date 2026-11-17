using System.Text.RegularExpressions;

using TaskTracker.Core.Persistence;
using TaskTracker.Core.SavedSearches;
using TaskTracker.Core.Search;
using TaskTracker.Core.Search.Syntax;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>
/// Creates the file's saved searches as new ones, pointing at the new projects and folders and
/// rewriting choice IDs and legacy custom link keys in their query text (§7.7).
/// </summary>
internal sealed partial class SavedSearchImporter(IUnitOfWork work, TimeProvider clock, ImportMap map, IssueList issues)
{
    public async Task<int> ImportAsync(ExportDocument document, CancellationToken cancellationToken)
    {
        var existing = await work.SavedSearches.ListAsync(cancellationToken);
        var takenNames = new TakenNames(existing.Select(search => search.Name), SavedSearch.NameMaxLength);
        var nextOrder = existing.Count == 0 ? 0 : existing.Max(search => search.SortOrder) + 1;
        var documents = document.SavedSearches.OrEmpty();

        foreach (var position in ImportOrder.Positions(documents, search => search.SortOrder))
        {
            var path = ImportChecks.Element("$.savedSearches", position);
            AddSearch(documents[position], takenNames, nextOrder++, path);
        }

        return documents.Count;
    }

    private void AddSearch(SavedSearchDocument document, TakenNames takenNames, int sortOrder, string path)
    {
        var scope = CreateScope(document);
        var query = RewriteLegacyLinkKey(RewriteIds(document.QueryText!), scope);

        if (query.Length > SavedSearch.QueryTextMaxLength)
        {
            issues.Add($"{path}.queryText",
                $"Renaming the custom link field makes the query longer than {SavedSearch.QueryTextMaxLength} characters.");
            return;
        }

        var definition = new SavedSearchDefinition(query, scope, document.IncludeCompleted == true);
        var search = SavedSearch.Create(takenNames.Reserve(document.Name!), definition, clock, sortOrder);
        search.RestoreTimestamps(
            ImportTimestamps.Created(document.CreatedAtUtc, clock),
            ImportTimestamps.Updated(document.UpdatedAtUtc, document.CreatedAtUtc, clock));

        work.SavedSearches.Add(search);
    }

    private string RewriteLegacyLinkKey(string query, SearchScope scope)
    {
        const string legacyKey = "link";

        if (!map.Fields.TryGetValue(legacyKey, out var field) || field.Key == legacyKey)
        {
            return query;
        }

        var owner = field.ProjectId;
        var inScope = scope switch
        {
            SearchScope.Project project => owner is null || owner == project.ProjectId,
            SearchScope.Area area => owner is null || owner == area.ProjectId,
            _ => true
        };

        return inScope ? QueryFieldKeyRewriter.Rename(query, legacyKey, field.Key) : query;
    }

    private SearchScope CreateScope(SavedSearchDocument document)
    {
        ImportChecks.TryParseScopeKind(document.ScopeKind, out var kind);

        if (kind == SavedSearchScopeKind.AllProjects)
        {
            return new SearchScope.AllProjects();
        }

        var projectId = map.Projects[document.ProjectId!.Value];

        if (kind == SavedSearchScopeKind.Project)
        {
            return new SearchScope.Project(projectId);
        }

        var folderId = document.FolderId is Guid folder ? map.Folders[folder] : (Guid?)null;

        return new SearchScope.Area(projectId, folderId, document.IncludeSubfolders != false);
    }

    private string RewriteIds(string queryText)
    {
        var replacements = map.QueryIds.ToDictionary(pair => pair.Key, pair => pair.Value);

        return GuidReference().Replace(queryText, match => RewriteReference(match, replacements));
    }

    private static string RewriteReference(Match match, Dictionary<Guid, Guid> replacements)
    {
        var known = Guid.TryParse(match.Groups["id"].Value, out var oldId) && replacements.ContainsKey(oldId);

        return known ? "#" + replacements[oldId].ToString("D") : match.Value;
    }

    [GeneratedRegex("#(?<id>[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})")]
    private static partial Regex GuidReference();
}