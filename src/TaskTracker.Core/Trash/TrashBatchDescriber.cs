using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;

namespace TaskTracker.Core.Trash;

/// <summary>Turns the rows of a deletion batch into the <see cref="TrashBatch"/> the trash lists.</summary>
public static class TrashBatchDescriber
{
    /// <summary>Describes the batch: its top node, location, size and whether it can be restored.</summary>
    public static TrashBatch Describe(TrashBatchRows batch)
    {
        return new TrashBatch(
            batch.BatchId,
            batch.Kind,
            TopNodeId(batch),
            TopNodeTitle(batch),
            batch.Rows.Project.Id,
            LocationPath(batch),
            DeletedAtUtc(batch),
            batch.Folders.Count,
            batch.Items.Count,
            RestoreBlockedReason(batch));
    }

    /// <summary>
    /// Explains why the batch cannot be restored yet (its top node still sits under something
    /// deleted, §5.3), or returns null when it can be restored.
    /// </summary>
    public static string? RestoreBlockedReason(TrashBatchRows batch)
    {
        return batch.Kind switch
        {
            TrashNodeKind.Folder => FolderBlockedReason(batch.Rows, batch.TopFolder!),
            TrashNodeKind.Item => ItemBlockedReason(batch.Rows, batch.TopItem!),
            _ => null
        };
    }

    private static Guid TopNodeId(TrashBatchRows batch)
    {
        return batch.Kind switch
        {
            TrashNodeKind.Project => batch.DeletedProject!.Id,
            TrashNodeKind.Folder => batch.TopFolder!.Id,
            _ => batch.TopItem!.Id
        };
    }

    /// <summary>The name of the folder, item or project a batch started from.</summary>
    public static string TopNodeTitle(TrashBatchRows batch)
    {
        return batch.Kind switch
        {
            TrashNodeKind.Project => batch.DeletedProject!.Name,
            TrashNodeKind.Folder => batch.TopFolder!.Name,
            _ => batch.TopItem!.Title
        };
    }

    private static DateTime DeletedAtUtc(TrashBatchRows batch)
    {
        return batch.Kind switch
        {
            TrashNodeKind.Project => batch.DeletedProject!.DeletedAtUtc!.Value,
            TrashNodeKind.Folder => batch.TopFolder!.DeletedAtUtc!.Value,
            _ => batch.TopItem!.DeletedAtUtc!.Value
        };
    }

    private static IReadOnlyList<string> LocationPath(TrashBatchRows batch)
    {
        var rows = batch.Rows;
        var path = new List<string>();

        if (batch.Kind == TrashNodeKind.Project)
        {
            return path;
        }

        path.Add(rows.Project.Name);

        if (batch.TopFolder is Folder topFolder)
        {
            path.AddRange(FolderNames(rows, topFolder.ParentFolderId));
        }
        else
        {
            path.AddRange(FolderNames(rows, batch.TopItem!.FolderId));
            path.AddRange(ItemTitles(rows, batch.TopItem.ParentItemId));
        }

        return path;
    }

    /// <summary>Folder names from the top-level folder down to the given folder; empty for the project root.</summary>
    private static List<string> FolderNames(TrashProjectRows rows, Guid? folderId)
    {
        var names = new List<string>();
        var seen = new HashSet<Guid>();

        while (folderId is Guid id && seen.Add(id) && rows.FindFolder(id) is Folder folder)
        {
            names.Insert(0, folder.Name);
            folderId = folder.ParentFolderId;
        }

        return names;
    }

    /// <summary>Item titles from the top-level item down to the given item; empty for a top-level item's parent.</summary>
    private static List<string> ItemTitles(TrashProjectRows rows, Guid? itemId)
    {
        var titles = new List<string>();
        var seen = new HashSet<Guid>();

        while (itemId is Guid id && seen.Add(id) && rows.FindItem(id) is TodoItem item)
        {
            titles.Insert(0, item.Title);
            itemId = item.ParentItemId;
        }

        return titles;
    }

    private static string? FolderBlockedReason(TrashProjectRows rows, Folder top)
    {
        if (top.ParentFolderId is Guid parentId && rows.FindFolder(parentId) is Folder { DeletedAtUtc: not null } parent)
        {
            return $"Restore the folder '{parent.Name}' first";
        }

        return ProjectBlockedReason(rows);
    }

    private static string? ItemBlockedReason(TrashProjectRows rows, TodoItem top)
    {
        if (top.ParentItemId is Guid parentId && rows.FindItem(parentId) is TodoItem { DeletedAtUtc: not null } parent)
        {
            return $"Restore the item '{parent.Title}' first";
        }

        if (top.FolderId is Guid folderId && rows.FindFolder(folderId) is Folder { DeletedAtUtc: not null } folder)
        {
            return $"Restore the folder '{folder.Name}' first";
        }

        return ProjectBlockedReason(rows);
    }

    private static string? ProjectBlockedReason(TrashProjectRows rows)
    {
        return rows.Project.DeletedAtUtc is null ? null : "Restore the project first";
    }
}