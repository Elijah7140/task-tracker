using TaskTracker.Core;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Search;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// Turns compact search hits into display rows. A hit whose project or folder was deleted
/// since the search ran is left out instead of failing the whole search.
/// </summary>
internal sealed class SearchResultFactory(ProjectService projects, LookupService? lookups)
{
    private const string PathSeparator = " › ";

    public async Task<IReadOnlyList<SearchResultViewModel>> CreateAsync(
        IReadOnlyList<ItemSearchResult> hits, CancellationToken cancellationToken)
    {
        var types = await LoadTypesAsync(cancellationToken);
        var priorities = await LoadPrioritiesAsync(cancellationToken);
        var snapshots = new Dictionary<Guid, ProjectWorkspaceSnapshot?>();
        var rows = new List<SearchResultViewModel>();

        foreach (var hit in hits)
        {
            var snapshot = await FindSnapshotAsync(snapshots, hit.ProjectId, cancellationToken);
            var location = snapshot is null ? null : TryBuildLocation(snapshot, hit.FolderId);

            if (location is null)
            {
                continue;
            }

            var typeName = types.FirstOrDefault(type => type.Id == hit.ItemTypeId)?.Name;
            var priorityName = priorities.FirstOrDefault(level => level.Id == hit.PriorityLevelId)?.Label;
            rows.Add(new SearchResultViewModel(hit, location, typeName, priorityName));
        }

        return rows;
    }

    private async Task<IReadOnlyList<ItemType>> LoadTypesAsync(CancellationToken cancellationToken)
    {
        if (lookups is null)
        {
            return [];
        }

        return await lookups.ItemTypesAsync(cancellationToken);
    }

    private async Task<IReadOnlyList<PriorityLevel>> LoadPrioritiesAsync(CancellationToken cancellationToken)
    {
        if (lookups is null)
        {
            return [];
        }

        return await lookups.PriorityLevelsAsync(cancellationToken);
    }

    private async Task<ProjectWorkspaceSnapshot?> FindSnapshotAsync(
        Dictionary<Guid, ProjectWorkspaceSnapshot?> snapshots, Guid projectId, CancellationToken cancellationToken)
    {
        if (snapshots.TryGetValue(projectId, out var known))
        {
            return known;
        }

        var snapshot = await TryLoadSnapshotAsync(projectId, cancellationToken);
        snapshots.Add(projectId, snapshot);
        return snapshot;
    }

    private async Task<ProjectWorkspaceSnapshot?> TryLoadSnapshotAsync(
        Guid projectId, CancellationToken cancellationToken)
    {
        try
        {
            return await projects.LoadWorkspaceAsync(projectId, cancellationToken);
        }
        catch (DomainRuleException)
        {
            return null;
        }
    }

    private static string? TryBuildLocation(ProjectWorkspaceSnapshot snapshot, Guid? folderId)
    {
        if (folderId is not Guid id)
        {
            return snapshot.Name;
        }

        try
        {
            return BuildLocation(snapshot, id);
        }
        catch (DomainRuleException)
        {
            return null;
        }
    }

    private static string BuildLocation(ProjectWorkspaceSnapshot snapshot, Guid folderId)
    {
        var names = new List<string> { snapshot.Name };

        foreach (var ancestor in snapshot.Folders.Ancestors(folderId).Reverse())
        {
            names.Add(ancestor.Name);
        }

        names.Add(snapshot.Folders.Get(folderId).Name);
        return string.Join(PathSeparator, names);
    }
}