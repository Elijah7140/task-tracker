using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;

namespace TaskTracker.Core.Trash;

/// <summary>Every row of one project, deleted or not, so deletion batches can be read and acted on.</summary>
public sealed class TrashProjectRows
{
    private readonly Dictionary<Guid, Folder> foldersById;
    private readonly Dictionary<Guid, TodoItem> itemsById;

    /// <summary>Wraps the complete row sets of one project.</summary>
    public TrashProjectRows(Project project, IEnumerable<Folder> folders, IEnumerable<TodoItem> items)
    {
        Project = project;
        foldersById = folders.ToDictionary(folder => folder.Id);
        itemsById = items.ToDictionary(item => item.Id);
    }

    public Project Project { get; }

    public IReadOnlyCollection<Folder> Folders => foldersById.Values;

    public IReadOnlyCollection<TodoItem> Items => itemsById.Values;

    public Folder? FindFolder(Guid id)
    {
        return foldersById.GetValueOrDefault(id);
    }

    public TodoItem? FindItem(Guid id)
    {
        return itemsById.GetValueOrDefault(id);
    }

    /// <summary>The distinct deletion batch ids found on the project, its folders and its items.</summary>
    public IReadOnlyList<Guid> BatchIds()
    {
        var ids = new HashSet<Guid>();
        AddIfPresent(ids, Project.DeletionBatchId);

        foreach (var folder in Folders)
        {
            AddIfPresent(ids, folder.DeletionBatchId);
        }

        foreach (var item in Items)
        {
            AddIfPresent(ids, item.DeletionBatchId);
        }

        return ids.ToArray();
    }

    private static void AddIfPresent(HashSet<Guid> ids, Guid? batchId)
    {
        if (batchId is Guid id)
        {
            ids.Add(id);
        }
    }
}