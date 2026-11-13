using TaskTracker.Core.Projects;

namespace TaskTracker.Core.Items;

/// <summary>Owns all item rows in one area, including deleted rows needed for restore and moves.</summary>
public sealed class ItemTree
{
    private readonly Dictionary<Guid, TodoItem> items;

    public Guid ProjectId { get; }

    public Guid? FolderId { get; }

    /// <summary>Loads every row in an area. Phase 1b must disable the deletion filter for this query.</summary>
    public ItemTree(Guid projectId, Guid? folderId, IEnumerable<TodoItem> rows, FolderTree? folders = null)
    {
        ProjectId = projectId;
        FolderId = folderId;

        if (folderId is Guid folderIdValue &&
            (folders is null || folders.ProjectId != projectId || folders.Get(folderIdValue).Id != folderIdValue))
        {
            throw new InvalidOperationException("Area folder is missing or belongs to another project.");
        }

        items = rows.ToDictionary(item => item.Id);

        foreach (var item in items.Values)
        {
            ValidateRow(item);
        }
    }

    /// <summary>Active rows in this area.</summary>
    public IReadOnlyList<TodoItem> All => items.Values.Where(item => item.DeletedAtUtc is null).ToArray();

    /// <summary>Every row in this area, including deleted descendants.</summary>
    public IReadOnlyList<TodoItem> AllRows => items.Values.ToArray();

    public TodoItem Get(Guid id)
    {
        if (!items.TryGetValue(id, out var item) || item.DeletedAtUtc is not null)
        {
            throw new InvalidOperationException("Item is missing or deleted.");
        }

        return item;
    }

    public IReadOnlyList<TodoItem> Children(Guid? parentId)
    {
        return All.Where(item => item.ParentItemId == parentId).OrderBy(item => item.SortOrder).ToArray();
    }

    public IReadOnlyList<TodoItem> Ancestors(Guid id)
    {
        var ancestors = new List<TodoItem>();
        var seen = new HashSet<Guid> { id };
        var current = Get(id);

        while (current.ParentItemId is Guid parentId)
        {
            if (!seen.Add(parentId))
            {
                throw new InvalidOperationException("Item cycle detected.");
            }

            current = Get(parentId);
            ancestors.Add(current);
        }

        return ancestors;
    }

    public IReadOnlyList<TodoItem> Descendants(Guid id)
    {
        return WalkActive(id).ToArray();
    }

    public void Add(TodoItem item)
    {
        if (item.DeletedAtUtc is not null)
        {
            throw new InvalidOperationException("Cannot add a deleted item as active.");
        }

        ValidateRow(item);

        if (!items.TryAdd(item.Id, item))
        {
            throw new InvalidOperationException("Duplicate item.");
        }
    }

    public void Move(Guid id, Guid? parentId, TimeProvider clock)
    {
        var item = Get(id);

        if (parentId is Guid newParentId)
        {
            Get(newParentId);

            if (newParentId == id || WalkAll(id).Any(descendant => descendant.Id == newParentId))
            {
                throw new InvalidOperationException("Item move would create a cycle.");
            }
        }

        item.MoveTo(FolderId, parentId, clock);
    }

    /// <summary>Moves a top-level item and all descendants, including deleted ones, to another area.</summary>
    public void MoveTopLevelTo(Guid id, ItemTree destination, TimeProvider clock)
    {
        var root = Get(id);

        if (root.ParentItemId is not null || destination.ProjectId != ProjectId)
        {
            throw new InvalidOperationException("Only a top-level item can move to another area in the same project.");
        }

        var branch = new[] { root }.Concat(WalkAll(id)).ToArray();

        if (branch.Any(item => destination.items.ContainsKey(item.Id)))
        {
            throw new InvalidOperationException("Destination contains an item in the branch.");
        }

        foreach (var item in branch)
        {
            items.Remove(item.Id);
            destination.items.Add(item.Id, item);
            item.MoveTo(destination.FolderId, item.ParentItemId, clock);
        }
    }

    /// <summary>Deletes active descendants with one batch while retaining earlier deletion batches.</summary>
    public void DeleteSubtree(Guid id, Guid batchId, TimeProvider clock)
    {
        var branch = new[] { Get(id) }.Concat(Descendants(id));

        foreach (var item in branch)
        {
            item.Delete(batchId, clock);
        }
    }

    /// <summary>Validates a restored row already held by the tree or adds one loaded separately.</summary>
    public void IncludeRestored(TodoItem item)
    {
        if (items.TryGetValue(item.Id, out var existing))
        {
            if (!ReferenceEquals(existing, item) || item.DeletedAtUtc is not null)
            {
                throw new InvalidOperationException("Restored item does not match the loaded row.");
            }

            ValidateRow(item);
            return;
        }

        Add(item);
    }

    private void ValidateRow(TodoItem item)
    {
        if (item.ProjectId != ProjectId || item.FolderId != FolderId)
        {
            throw new InvalidOperationException("Item belongs to another area.");
        }

        if (item.ParentItemId is Guid parentId)
        {
            if (!items.TryGetValue(parentId, out var parent) ||
                (item.DeletedAtUtc is null && parent.DeletedAtUtc is not null))
            {
                throw new InvalidOperationException("Item parent is missing or deleted.");
            }
        }

        DetectCycle(item);
    }

    private void DetectCycle(TodoItem item)
    {
        var seen = new HashSet<Guid> { item.Id };
        var current = item;

        while (current.ParentItemId is Guid parentId)
        {
            if (!seen.Add(parentId))
            {
                throw new InvalidOperationException("Item cycle detected.");
            }

            current = items[parentId];
        }
    }

    private IEnumerable<TodoItem> WalkActive(Guid id)
    {
        foreach (var child in Children(id))
        {
            yield return child;

            foreach (var descendant in WalkActive(child.Id))
            {
                yield return descendant;
            }
        }
    }

    private IEnumerable<TodoItem> WalkAll(Guid id)
    {
        foreach (var child in items.Values.Where(item => item.ParentItemId == id))
        {
            yield return child;

            foreach (var descendant in WalkAll(child.Id))
            {
                yield return descendant;
            }
        }
    }
}