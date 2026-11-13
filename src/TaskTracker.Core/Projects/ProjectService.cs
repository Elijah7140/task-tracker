using TaskTracker.Core.Completion;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Settings;
using TaskTracker.Core.Urgency;

namespace TaskTracker.Core.Projects;

/// <summary>Coordinates project changes and home-screen counts.</summary>
public sealed class ProjectService(
    IUnitOfWorkFactory unitOfWorkFactory,
    TimeProvider clock,
    TimeZoneInfo timeZone)
{
    /// <summary>
    /// Loads the project's name and folder tree in one unit of work.
    /// Throws <see cref="DomainRuleException"/> if the project is missing or deleted.
    /// </summary>
    public async Task<ProjectWorkspaceSnapshot> LoadWorkspaceAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var project = await GetAsync(unitOfWork, id, cancellationToken);
        var folders = await unitOfWork.Folders.ListAsync(id, false, cancellationToken);

        return new ProjectWorkspaceSnapshot(project.Name, new FolderTree(id, folders));
    }

    public async Task<Project> CreateAsync(string name, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var projects = unitOfWork.Projects;
        var project = Project.Create(name, clock);
        projects.Add(project);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return project;
    }

    public async Task RenameAsync(Guid id, string name, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var project = await GetAsync(unitOfWork, id, cancellationToken);
        project.Rename(name, clock);
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task ReorderAsync(IReadOnlyList<Guid> ids, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var projects = unitOfWork.Projects;
        var rows = await projects.ListAsync(false, cancellationToken);

        if (ids.Count != rows.Count || ids.ToHashSet().Count != rows.Count || rows.Any(row => !ids.Contains(row.Id)))
        {
            throw new DomainRuleException("Order must contain every active project exactly once.");
        }

        for (var index = 0; index < ids.Count; index++)
        {
            rows.Single(row => row.Id == ids[index]).SetSortOrder(index, clock);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<ProjectSummary>> ListAsync(CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var projects = unitOfWork.Projects;
        var items = unitOfWork.Items;
        var settings = unitOfWork.Settings;
        var rows = await projects.ListAsync(false, cancellationToken);
        var result = new List<ProjectSummary>();

        foreach (var project in rows)
        {
            var projectItems = await items.LoadProjectAsync(project.Id, cancellationToken);
            var global = await settings.GetGlobalAsync(cancellationToken);
            var overrides = await settings.GetProjectAsync(project.Id, cancellationToken);
            var effective = SettingsResolver.Resolve(global, overrides);
            var thresholds = new UrgencyThresholds(effective.UrgencyYellowThreshold.Value, effective.UrgencyRedThreshold.Value);
            var active = projectItems.Where(item => item.DeletedAtUtc is null).ToArray();
            var overdue = active.Count(item => UrgencyCalculator.Calculate(item, clock.GetUtcNow().UtcDateTime, timeZone, thresholds) == TaskTracker.Core.Urgency.Urgency.Overdue);
            result.Add(new ProjectSummary(project, active.Count(item => item.CompletedAtUtc is null), overdue));
        }

        return result;
    }

    public async Task<Guid> DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var folders = unitOfWork.Folders;
        var items = unitOfWork.Items;
        var project = await GetAsync(unitOfWork, id, cancellationToken);
        var batchId = Guid.CreateVersion7();
        project.Delete(batchId, clock);

        foreach (var folder in await folders.ListAsync(id, true, cancellationToken))
        {
            folder.Delete(batchId, clock);
        }

        foreach (var item in await items.LoadProjectAsync(id, cancellationToken))
        {
            item.Delete(batchId, clock);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
        return batchId;
    }

    public async Task RestoreAsync(Guid batchId, CancellationToken cancellationToken = default)
    {
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var projects = unitOfWork.Projects;
        var folders = unitOfWork.Folders;
        var items = unitOfWork.Items;
        var project = (await projects.ListAsync(true, cancellationToken))
            .Single(row => row.DeletionBatchId == batchId);
        project.Restore(clock);

        foreach (var folder in await folders.ListAsync(project.Id, true, cancellationToken))
        {
            if (folder.DeletionBatchId == batchId)
            {
                folder.Restore(clock);
            }
        }

        foreach (var item in await items.LoadProjectAsync(project.Id, cancellationToken))
        {
            if (item.DeletionBatchId == batchId)
            {
                item.Restore(clock);
            }
        }

        await ProjectCompletionReconciler.ReconcileIfEnabledAsync(unitOfWork, project.Id, clock, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private async Task<Project> GetAsync(IUnitOfWork unitOfWork, Guid id, CancellationToken cancellationToken)
    {
        var projects = unitOfWork.Projects;
        return await projects.FindAsync(id, false, cancellationToken)
            ?? throw new DomainRuleException("Project is missing or deleted.");
    }
}