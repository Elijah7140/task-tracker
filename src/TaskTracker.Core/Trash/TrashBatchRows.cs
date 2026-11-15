using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;

namespace TaskTracker.Core.Trash;

/// <summary>The rows of one deletion batch and the node the batch started from.</summary>
public sealed class TrashBatchRows
{
    private TrashBatchRows(Guid batchId, TrashProjectRows rows, Project? deletedProject,
        IReadOnlyList<Folder> folders, IReadOnlyList<TodoItem> items)
    {
        BatchId = batchId;
        Rows = rows;
        DeletedProject = deletedProject;
        Folders = folders;
        Items = items;
        Kind = ChooseKind();
        TopFolder = Kind == TrashNodeKind.Folder ? FindTopFolder() : null;
        TopItem = Kind == TrashNodeKind.Item ? FindTopItem() : null;
    }

    public Guid BatchId { get; }

    /// <summary>Every row of the project the batch belongs to.</summary>
    public TrashProjectRows Rows { get; }

    /// <summary>The project row, when the whole project was deleted in this batch.</summary>
    public Project? DeletedProject { get; }

    public IReadOnlyList<Folder> Folders { get; }

    public IReadOnlyList<TodoItem> Items { get; }

    public TrashNodeKind Kind { get; }

    /// <summary>The folder at the top of a folder batch; null for other kinds.</summary>
    public Folder? TopFolder { get; }

    /// <summary>The item at the top of an item batch; null for other kinds.</summary>
    public TodoItem? TopItem { get; }

    /// <summary>Collects the rows that carry the batch id, or returns null when none do.</summary>
    public static TrashBatchRows? Find(TrashProjectRows rows, Guid batchId)
    {
        var project = rows.Project.DeletionBatchId == batchId ? rows.Project : null;
        var folders = rows.Folders.Where(folder => folder.DeletionBatchId == batchId).ToArray();
        var items = rows.Items.Where(item => item.DeletionBatchId == batchId).ToArray();

        if (project is null && folders.Length == 0 && items.Length == 0)
        {
            return null;
        }

        return new TrashBatchRows(batchId, rows, project, folders, items);
    }

    private TrashNodeKind ChooseKind()
    {
        if (DeletedProject is not null)
        {
            return TrashNodeKind.Project;
        }

        return Folders.Count > 0 ? TrashNodeKind.Folder : TrashNodeKind.Item;
    }

    private Folder? FindTopFolder()
    {
        var folderIds = Folders.Select(folder => folder.Id).ToHashSet();

        foreach (var folder in Folders)
        {
            if (folder.ParentFolderId is not Guid parentId || !folderIds.Contains(parentId))
            {
                return folder;
            }
        }

        return null;
    }

    private TodoItem? FindTopItem()
    {
        var itemIds = Items.Select(item => item.Id).ToHashSet();

        foreach (var item in Items)
        {
            if (item.ParentItemId is not Guid parentId || !itemIds.Contains(parentId))
            {
                return item;
            }
        }

        return null;
    }
}