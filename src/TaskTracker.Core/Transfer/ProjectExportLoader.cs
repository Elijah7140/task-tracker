using TaskTracker.Core.Persistence;
using TaskTracker.Core.Projects;

namespace TaskTracker.Core.Transfer;

/// <summary>Loads the active (not deleted) rows of projects for export.</summary>
internal static class ProjectExportLoader
{
    /// <summary>Loads every active project of the scope; a single project that is gone is a rule error.</summary>
    public static async Task<IReadOnlyList<ProjectExportData>> LoadAsync(
        IUnitOfWork work, TransferScope scope, CancellationToken cancellationToken)
    {
        var projects = await SelectProjectsAsync(work, scope, cancellationToken);
        var result = new List<ProjectExportData>();

        foreach (var project in projects)
        {
            result.Add(await LoadProjectAsync(work, project, cancellationToken));
        }

        return result;
    }

    /// <summary>Loads the active projects with these ids, in order, leaving out any that are missing or deleted.</summary>
    public static async Task<IReadOnlyList<ProjectExportData>> LoadActiveAsync(
        IUnitOfWork work, IEnumerable<Guid> projectIds, CancellationToken cancellationToken)
    {
        var result = new List<ProjectExportData>();

        foreach (var projectId in projectIds.Distinct())
        {
            var project = await work.Projects.FindAsync(projectId, false, cancellationToken);

            if (project is not null)
            {
                result.Add(await LoadProjectAsync(work, project, cancellationToken));
            }
        }

        return result;
    }

    private static async Task<IReadOnlyList<Project>> SelectProjectsAsync(
        IUnitOfWork work, TransferScope scope, CancellationToken cancellationToken)
    {
        if (scope is TransferScope.SingleProject single)
        {
            var project = await work.Projects.FindAsync(single.ProjectId, false, cancellationToken)
                ?? throw new DomainRuleException("Project is missing or deleted.");

            return [project];
        }

        return await work.Projects.ListAsync(false, cancellationToken);
    }

    private static async Task<ProjectExportData> LoadProjectAsync(
        IUnitOfWork work, Project project, CancellationToken cancellationToken)
    {
        var folders = await work.Folders.ListAsync(project.Id, false, cancellationToken);
        var allItems = await work.Items.LoadProjectAsync(project.Id, cancellationToken);
        var items = allItems.Where(item => item.DeletedAtUtc is null).ToList();
        var itemIds = items.Select(item => item.Id).ToHashSet();
        var allValues = await work.Fields.ValuesForProjectAsync(project.Id, cancellationToken);
        var values = allValues.Where(value => itemIds.Contains(value.ItemId)).ToList();
        var allLinks = await work.Items.LinksForProjectAsync(project.Id, cancellationToken);
        var links = allLinks.Where(link => itemIds.Contains(link.ItemId)).ToList();
        var settings = await work.Settings.GetProjectAsync(project.Id, cancellationToken);

        return new ProjectExportData(project, folders, items, values, links, settings);
    }
}