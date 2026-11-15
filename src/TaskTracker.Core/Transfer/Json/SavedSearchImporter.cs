using System.Text.RegularExpressions;

using TaskTracker.Core.Persistence;
using TaskTracker.Core.SavedSearches;
using TaskTracker.Core.Search;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>
/// Creates the file's saved searches as new ones, pointing at the new projects and folders and
/// rewriting the <c>#id</c> choices in their query text to the ids the choices now have (§7.7).
/// </summary>
internal sealed partial class SavedSearchImporter(IUnitOfWork work, TimeProvider clock, ImportMap map)
{
    public async Task<int> ImportAsync(ExportDocument document, CancellationToken cancellationToken)
    {
        var existing = await work.SavedSearches.ListAsync(cancellationToken);
        var takenNames = new TakenNames(existing.Select(search => search.Name), SavedSearch.NameMaxLength);
        var nextOrder = existing.Count == 0 ? 0 : existing.Max(search => search.SortOrder) + 1;
        var documents = document.SavedSearches.OrEmpty();

        foreach (var position in ImportOrder.Positions(documents, search => search.SortOrder))
        {
            work.SavedSearches.Add(CreateSearch(documents[position], takenNames, nextOrder++));
        }

        return documents.Count;
    }

    private SavedSearch CreateSearch(SavedSearchDocument document, TakenNames takenNames, int sortOrder)
    {
        var definition = new SavedSearchDefinition(
            RewriteIds(document.QueryText!), CreateScope(document), document.IncludeCompleted == true);
        var search = SavedSearch.Create(takenNames.Reserve(document.Name!), definition, clock, sortOrder);
        search.RestoreTimestamps(
            ImportTimestamps.Created(document.CreatedAtUtc, clock),
            ImportTimestamps.Updated(document.UpdatedAtUtc, document.CreatedAtUtc, clock));

        return search;
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