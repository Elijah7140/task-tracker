using TaskTracker.Core.Items;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Settings;

namespace TaskTracker.Core.Completion;

/// <summary>
/// Applies the auto-complete rule (§6.1) to every active area of a project inside an
/// existing unit of work. Callers save the unit of work, so reconciliation commits
/// together with the change that required it.
/// </summary>
public static class ProjectCompletionReconciler
{
    /// <summary>Reconciles the project only if its effective auto-complete setting is on (used after restores).</summary>
    public static async Task ReconcileIfEnabledAsync(IUnitOfWork work, Guid projectId, TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var global = await work.Settings.GetGlobalAsync(cancellationToken);
        var overrides = await work.Settings.GetProjectAsync(projectId, cancellationToken);
        var effective = SettingsResolver.Resolve(global, overrides);

        if (effective.AutoCompleteParents.Value)
        {
            await ReconcileAsync(work, projectId, clock, cancellationToken);
        }
    }

    /// <summary>Reconciles every active area of the project (used when auto-complete is being turned on).</summary>
    public static async Task ReconcileAsync(IUnitOfWork work, Guid projectId, TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var nowUtc = clock.GetUtcNow().UtcDateTime;

        foreach (var tree in await LoadActiveAreaTreesAsync(work, projectId, cancellationToken))
        {
            var result = CompletionService.ReconcileAll(tree, nowUtc);

            foreach (var change in result.Changes)
            {
                tree.Get(change.ItemId).SetCompletion(change.CompletedAtUtc, clock);
            }
        }
    }

    /// <summary>Counts the parents that <see cref="ReconcileAsync"/> would complete or reopen, without changing anything.</summary>
    public static async Task<ReconciliationPreview> PreviewAsync(IUnitOfWork work, Guid projectId, TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var parentsToComplete = 0;
        var parentsToReopen = 0;

        foreach (var tree in await LoadActiveAreaTreesAsync(work, projectId, cancellationToken))
        {
            var preview = CompletionService.PreviewReconciliation(tree, nowUtc);
            parentsToComplete += preview.ParentsToComplete;
            parentsToReopen += preview.ParentsToReopen;
        }

        return new ReconciliationPreview(parentsToComplete, parentsToReopen);
    }

    /// <summary>Builds one item tree per area of the project, skipping areas whose folder is deleted.</summary>
    private static async Task<List<ItemTree>> LoadActiveAreaTreesAsync(IUnitOfWork work, Guid projectId,
        CancellationToken cancellationToken)
    {
        var folderRows = await work.Folders.ListAsync(projectId, true, cancellationToken);
        var itemRows = await work.Items.LoadProjectAsync(projectId, cancellationToken);
        var folderTree = new FolderTree(projectId, folderRows);
        var deletedFolderIds = folderRows
            .Where(folder => folder.DeletedAtUtc is not null)
            .Select(folder => folder.Id)
            .ToHashSet();

        return itemRows
            .GroupBy(item => item.FolderId)
            .Where(area => area.Key is not Guid folderId || !deletedFolderIds.Contains(folderId))
            .Select(area => new ItemTree(projectId, area.Key, area, folderTree))
            .ToList();
    }
}