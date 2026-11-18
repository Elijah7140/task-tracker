using TaskTracker.Core.Completion;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Undo;

namespace TaskTracker.Core.Projects;

/// <summary>Coordinates folder hierarchy changes and batch restore.</summary>
public sealed class FolderService(
    IUnitOfWorkFactory unitOfWorkFactory,
    TimeProvider clock, FieldWriteGate? writeGate = null)
{
    private readonly FieldWriteGate gate = writeGate ?? FieldWriteGate.Shared;

    public async Task<Folder> CreateAsync(Guid projectId, Guid? parentId, string name, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var folders = unitOfWork.Folders;
        await RequireProjectAsync(unitOfWork, projectId, cancellationToken);
        var tree = await LoadTreeAsync(unitOfWork, projectId, cancellationToken);

        if (parentId is Guid id)
        {
            tree.Get(id);
        }

        var folder = Folder.Create(projectId, parentId, name, clock, tree.Children(parentId).Count);
        tree.Add(folder);
        folders.Add(folder);
        Renumber(tree, parentId);
        await unitOfWork.SaveChangesAsync(UndoLabels.Create(folder.Name), cancellationToken);
        return folder;
    }

    public async Task RenameAsync(Guid projectId, Guid id, string name, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var tree = await LoadTreeAsync(unitOfWork, projectId, cancellationToken);
        tree.Get(id).Rename(name, clock);
        await unitOfWork.SaveChangesAsync(UndoLabels.Rename(tree.Get(id).Name), cancellationToken);
    }

    public async Task MoveAsync(Guid projectId, Guid id, Guid? newParentId, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var tree = await LoadTreeAsync(unitOfWork, projectId, cancellationToken);
        var oldParentId = tree.Get(id).ParentFolderId;
        tree.Move(id, newParentId, clock);
        tree.Get(id).SetSortOrder(tree.Children(newParentId).Count - 1, clock);
        Renumber(tree, oldParentId);
        Renumber(tree, newParentId);
        await unitOfWork.SaveChangesAsync(UndoLabels.Move(tree.Get(id).Name), cancellationToken);
    }

    public async Task ReorderAsync(Guid projectId, Guid? parentId, IReadOnlyList<Guid> ids, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var tree = await LoadTreeAsync(unitOfWork, projectId, cancellationToken);
        var siblings = tree.Children(parentId);

        if (ids.Count != siblings.Count || ids.ToHashSet().Count != siblings.Count || siblings.Any(row => !ids.Contains(row.Id)))
        {
            throw new DomainRuleException("Order must contain every sibling exactly once.");
        }

        for (var index = 0; index < ids.Count; index++)
        {
            tree.Get(ids[index]).SetSortOrder(index, clock);
        }

        await unitOfWork.SaveChangesAsync(UndoLabels.ReorderFolders(), cancellationToken);
    }

    public async Task<Guid> DeleteAsync(Guid projectId, Guid id, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var items = unitOfWork.Items;
        var tree = await LoadTreeAsync(unitOfWork, projectId, cancellationToken);
        var affectedIds = new[] { id }.Concat(tree.Descendants(id).Select(folder => folder.Id)).ToHashSet();
        var batchId = Guid.CreateVersion7();
        var parentId = tree.Get(id).ParentFolderId;
        var label = UndoLabels.Delete(tree.Get(id).Name);
        tree.DeleteSubtree(id, batchId, clock);
        Renumber(tree, parentId);

        foreach (var item in await items.LoadProjectAsync(projectId, cancellationToken))
        {
            if (item.FolderId is Guid folderId && affectedIds.Contains(folderId))
            {
                item.Delete(batchId, clock);
            }
        }

        await unitOfWork.SaveChangesAsync(label, cancellationToken);
        return batchId;
    }

    /// <summary>
    /// Restores everything deleted together in one batch: folders and their items. Blocked when
    /// the batch's top folder sits under a folder that is still deleted (§5.3). Completion is
    /// reconciled in the same save.
    /// </summary>
    public async Task RestoreAsync(Guid projectId, Guid batchId, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unitOfWork = unitOfWorkFactory.Begin();
        await RequireProjectAsync(unitOfWork, projectId, cancellationToken);
        var rows = await unitOfWork.Folders.ListAsync(projectId, true, cancellationToken);
        var branch = rows.Where(folder => folder.DeletionBatchId == batchId).ToArray();

        if (branch.Length == 0)
        {
            throw new DomainRuleException("Folder deletion batch was not found.");
        }

        EnsureNoDeletedParentOutsideBatch(rows, branch);
        var branchIds = branch.Select(folder => folder.Id).ToHashSet();
        var topFolder = branch.Single(folder => folder.ParentFolderId is not Guid parentId || !branchIds.Contains(parentId));
        RestoreFolders(new FolderTree(projectId, rows), branch);
        await RestoreItemsAsync(unitOfWork, projectId, batchId, cancellationToken);

        await ProjectCompletionReconciler.ReconcileIfEnabledAsync(unitOfWork, projectId, clock, cancellationToken);
        await unitOfWork.SaveChangesAsync(UndoLabels.Restore(topFolder.Name), cancellationToken);
    }

    private static void EnsureNoDeletedParentOutsideBatch(IReadOnlyList<Folder> allFolders, IReadOnlyList<Folder> branch)
    {
        var branchIds = branch.Select(folder => folder.Id).ToHashSet();
        var deletedIds = allFolders
            .Where(folder => folder.DeletedAtUtc is not null)
            .Select(folder => folder.Id)
            .ToHashSet();

        foreach (var folder in branch)
        {
            if (folder.ParentFolderId is Guid parentId && !branchIds.Contains(parentId) && deletedIds.Contains(parentId))
            {
                throw new DomainRuleException("Restore the parent folder first.");
            }
        }
    }

    private void RestoreFolders(FolderTree tree, IReadOnlyList<Folder> branch)
    {
        foreach (var folder in branch)
        {
            folder.Restore(clock);
        }

        foreach (var parentId in branch.Select(folder => folder.ParentFolderId).Distinct())
        {
            Renumber(tree, parentId);
        }
    }

    private async Task RestoreItemsAsync(IUnitOfWork unitOfWork, Guid projectId, Guid batchId, CancellationToken cancellationToken)
    {
        foreach (var item in await unitOfWork.Items.LoadProjectAsync(projectId, cancellationToken))
        {
            if (item.DeletionBatchId == batchId)
            {
                item.Restore(clock);
            }
        }
    }

    private void Renumber(FolderTree tree, Guid? parentId)
    {
        var siblings = tree.Children(parentId);

        for (var index = 0; index < siblings.Count; index++)
        {
            siblings[index].SetSortOrder(index, clock);
        }
    }

    private async Task<FolderTree> LoadTreeAsync(IUnitOfWork unitOfWork, Guid projectId, CancellationToken cancellationToken)
    {
        var folders = unitOfWork.Folders;
        await RequireProjectAsync(unitOfWork, projectId, cancellationToken);
        return new FolderTree(projectId, await folders.ListAsync(projectId, true, cancellationToken));
    }

    private async Task RequireProjectAsync(IUnitOfWork unitOfWork, Guid projectId, CancellationToken cancellationToken)
    {
        var projects = unitOfWork.Projects;
        if (await projects.FindAsync(projectId, false, cancellationToken) is null)
        {
            throw new DomainRuleException("Project is missing or deleted.");
        }
    }
}