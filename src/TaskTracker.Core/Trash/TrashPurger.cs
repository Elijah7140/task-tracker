using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;

namespace TaskTracker.Core.Trash;

/// <summary>
/// Marks deleted rows for permanent removal inside an existing unit of work; the caller saves.
/// Rows may only go when nothing that stays behind still points at them.
/// </summary>
public sealed class TrashPurger(ITrashRepository trash)
{
    /// <summary>
    /// Removes one batch. A project batch removes the whole project, because nothing inside
    /// a project can outlive it. A folder or item batch is refused while a row outside the
    /// batch (deleted earlier, or even live) still sits inside it.
    /// </summary>
    public async Task PurgeBatchAsync(TrashBatchRows batch, CancellationToken cancellationToken)
    {
        if (batch.DeletedProject is not null)
        {
            await PurgeProjectAsync(batch.Rows, cancellationToken);
            return;
        }

        EnsureNothingOutsideStillInside(batch.Rows, batch.Folders, batch.Items);
        RemoveRows(batch.Folders, batch.Items);
    }

    /// <summary>
    /// Removes every deleted row of a project, or the whole project when it is deleted itself.
    /// A live row that still points at a deleted row stops the removal.
    /// </summary>
    public async Task PurgeAllDeletedAsync(TrashProjectRows rows, CancellationToken cancellationToken)
    {
        if (rows.Project.DeletedAtUtc is not null)
        {
            await PurgeProjectAsync(rows, cancellationToken);
            return;
        }

        var folders = rows.Folders.Where(folder => folder.DeletedAtUtc is not null).ToArray();
        var items = rows.Items.Where(item => item.DeletedAtUtc is not null).ToArray();
        EnsureNothingOutsideStillInside(rows, folders, items);
        RemoveRows(folders, items);
    }

    private async Task PurgeProjectAsync(TrashProjectRows rows, CancellationToken cancellationToken)
    {
        RemoveRows(rows.Folders, rows.Items);
        await trash.RemoveProjectOwnedDataAsync(rows.Project.Id, cancellationToken);
        trash.Remove(rows.Project);
    }

    private void RemoveRows(IEnumerable<Folder> folders, IEnumerable<TodoItem> items)
    {
        foreach (var item in items)
        {
            trash.Remove(item);
        }

        foreach (var folder in folders)
        {
            trash.Remove(folder);
        }
    }

    private static void EnsureNothingOutsideStillInside(TrashProjectRows rows,
        IReadOnlyCollection<Folder> folders, IReadOnlyCollection<TodoItem> items)
    {
        var folderIds = folders.Select(folder => folder.Id).ToHashSet();
        var itemIds = items.Select(item => item.Id).ToHashSet();

        foreach (var remaining in rows.Items.Where(item => !itemIds.Contains(item.Id)))
        {
            EnsureItemIsNotInside(rows, remaining, folderIds, itemIds);
        }

        foreach (var remaining in rows.Folders.Where(folder => !folderIds.Contains(folder.Id)))
        {
            EnsureFolderIsNotInside(rows, remaining, folderIds);
        }
    }

    private static void EnsureItemIsNotInside(TrashProjectRows rows, TodoItem remaining,
        HashSet<Guid> folderIds, HashSet<Guid> itemIds)
    {
        if (remaining.ParentItemId is Guid parentId && itemIds.Contains(parentId))
        {
            throw StillInside(remaining.Title, rows.FindItem(parentId)!.Title);
        }

        if (remaining.FolderId is Guid folderId && folderIds.Contains(folderId))
        {
            throw StillInside(remaining.Title, rows.FindFolder(folderId)!.Name);
        }
    }

    private static void EnsureFolderIsNotInside(TrashProjectRows rows, Folder remaining, HashSet<Guid> folderIds)
    {
        if (remaining.ParentFolderId is Guid parentId && folderIds.Contains(parentId))
        {
            throw StillInside(remaining.Name, rows.FindFolder(parentId)!.Name);
        }
    }

    private static DomainRuleException StillInside(string remainingName, string ownerName)
    {
        return new DomainRuleException(
            $"'{remainingName}' still belongs to '{ownerName}'. Delete '{remainingName}' permanently first.");
    }
}