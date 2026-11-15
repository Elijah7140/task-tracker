using TaskTracker.Core.Completion;
using TaskTracker.Core.Items;
using TaskTracker.Core.Persistence;

namespace TaskTracker.Core.Trash;

/// <summary>
/// Lists deletion batches (§5.3) and restores or permanently removes them. Each public
/// operation uses one unit of work and saves once.
/// </summary>
public sealed class TrashService(IUnitOfWorkFactory unitOfWorkFactory, TimeProvider clock) : ITrashService
{
    private const string MissingBatchMessage =
        "That deletion no longer exists. It may already have been restored or deleted permanently.";

    /// <summary>Lists the batches in scope, newest deletion first.</summary>
    public async Task<IReadOnlyList<TrashBatch>> ListAsync(TrashScope scope, CancellationToken cancellationToken = default)
    {
        await using var work = unitOfWorkFactory.Begin();
        var batches = new List<TrashBatch>();

        foreach (var rows in await LoadProjectsWithDeletionsAsync(work, scope, cancellationToken))
        {
            batches.AddRange(DescribeBatches(rows));
        }

        return batches
            .OrderByDescending(batch => batch.DeletedAtUtc)
            .ThenByDescending(batch => batch.BatchId)
            .ToArray();
    }

    /// <summary>
    /// Restores exactly the rows of one batch. Throws <see cref="DomainRuleException"/> when the
    /// batch is gone or its top node still sits under something deleted. The restored top node
    /// goes to the end of its siblings, and completion is reconciled like any other tree change (§6.1).
    /// </summary>
    public async Task RestoreAsync(Guid batchId, CancellationToken cancellationToken = default)
    {
        await using var work = unitOfWorkFactory.Begin();
        var batch = await LoadBatchAsync(work, batchId, cancellationToken);

        if (TrashBatchDescriber.RestoreBlockedReason(batch) is string reason)
        {
            throw new DomainRuleException(reason);
        }

        var position = await AppendPositionAsync(work, batch, cancellationToken);
        RestoreRows(batch, position);
        await ProjectCompletionReconciler.ReconcileIfEnabledAsync(work, batch.Rows.Project.Id, clock, cancellationToken);
        await work.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// Permanently removes one batch. Throws <see cref="DomainRuleException"/> when the batch is
    /// gone or other rows still sit inside it. Purging a project batch removes the whole project.
    /// </summary>
    public async Task PurgeAsync(Guid batchId, CancellationToken cancellationToken = default)
    {
        await using var work = unitOfWorkFactory.Begin();
        var batch = await LoadBatchAsync(work, batchId, cancellationToken);
        await new TrashPurger(work.Trash).PurgeBatchAsync(batch, cancellationToken);
        await work.SaveChangesAsync(cancellationToken);
    }

    /// <summary>Permanently removes every deleted row in scope, in one transaction.</summary>
    public async Task EmptyAsync(TrashScope scope, CancellationToken cancellationToken = default)
    {
        await using var work = unitOfWorkFactory.Begin();
        var purger = new TrashPurger(work.Trash);

        foreach (var rows in await LoadProjectsWithDeletionsAsync(work, scope, cancellationToken))
        {
            await purger.PurgeAllDeletedAsync(rows, cancellationToken);
        }

        await work.SaveChangesAsync(cancellationToken);
    }

    private static IEnumerable<TrashBatch> DescribeBatches(TrashProjectRows rows)
    {
        foreach (var batchId in rows.BatchIds())
        {
            var batch = TrashBatchRows.Find(rows, batchId);

            if (batch is not null)
            {
                yield return TrashBatchDescriber.Describe(batch);
            }
        }
    }

    private static async Task<List<TrashProjectRows>> LoadProjectsWithDeletionsAsync(IUnitOfWork work,
        TrashScope scope, CancellationToken cancellationToken)
    {
        var projects = new List<TrashProjectRows>();
        var ids = await work.Trash.ListProjectIdsWithDeletionsAsync(scope.ProjectId, cancellationToken);

        foreach (var projectId in ids)
        {
            projects.Add(await LoadProjectRowsAsync(work, projectId, cancellationToken));
        }

        return projects;
    }

    private static async Task<TrashProjectRows> LoadProjectRowsAsync(IUnitOfWork work, Guid projectId,
        CancellationToken cancellationToken)
    {
        var project = await work.Projects.FindAsync(projectId, true, cancellationToken)
            ?? throw new DomainRuleException(MissingBatchMessage);
        var folders = await work.Folders.ListAsync(projectId, true, cancellationToken);
        var items = await work.Items.LoadProjectAsync(projectId, cancellationToken);
        return new TrashProjectRows(project, folders, items);
    }

    private static async Task<TrashBatchRows> LoadBatchAsync(IUnitOfWork work, Guid batchId,
        CancellationToken cancellationToken)
    {
        var projectId = await work.Trash.FindProjectIdAsync(batchId, cancellationToken)
            ?? throw new DomainRuleException(MissingBatchMessage);
        var rows = await LoadProjectRowsAsync(work, projectId, cancellationToken);
        return TrashBatchRows.Find(rows, batchId) ?? throw new DomainRuleException(MissingBatchMessage);
    }

    /// <summary>The sort order that places the batch's top node after its current siblings.</summary>
    private static async Task<int> AppendPositionAsync(IUnitOfWork work, TrashBatchRows batch,
        CancellationToken cancellationToken)
    {
        var rows = batch.Rows;

        if (batch.Kind == TrashNodeKind.Project)
        {
            var projects = await work.Projects.ListAsync(false, cancellationToken);
            return NextAfter(projects.Select(project => project.SortOrder));
        }

        if (batch.TopFolder is not null)
        {
            var parentId = batch.TopFolder.ParentFolderId;
            var folders = rows.Folders.Where(folder => folder.DeletedAtUtc is null && folder.ParentFolderId == parentId);
            return NextAfter(folders.Select(folder => folder.SortOrder));
        }

        var top = batch.TopItem!;
        var siblings = rows.Items.Where(item => IsActiveSibling(item, top));
        return NextAfter(siblings.Select(item => item.SortOrder));
    }

    /// <summary>One more than the largest sort order, or 0 when there are no siblings; gaps stay gaps.</summary>
    private static int NextAfter(IEnumerable<int> siblingOrders)
    {
        var orders = siblingOrders.ToArray();
        return orders.Length == 0 ? 0 : orders.Max() + 1;
    }

    private static bool IsActiveSibling(TodoItem item, TodoItem top)
    {
        return item.DeletedAtUtc is null && item.FolderId == top.FolderId && item.ParentItemId == top.ParentItemId;
    }

    private void RestoreRows(TrashBatchRows batch, int topPosition)
    {
        batch.DeletedProject?.Restore(clock);

        foreach (var folder in batch.Folders)
        {
            folder.Restore(clock);
        }

        foreach (var item in batch.Items)
        {
            item.Restore(clock);
        }

        PlaceTopNode(batch, topPosition);
    }

    private void PlaceTopNode(TrashBatchRows batch, int position)
    {
        batch.DeletedProject?.SetSortOrder(position, clock);
        batch.TopFolder?.SetSortOrder(position, clock);
        batch.TopItem?.SetSortOrder(position, clock);
    }
}