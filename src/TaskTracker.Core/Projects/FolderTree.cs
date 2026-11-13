namespace TaskTracker.Core.Projects;

/// <summary>Validates and navigates the active folders of one project.</summary>
public sealed class FolderTree
{
    private readonly Dictionary<Guid, Folder> folders;

    public Guid ProjectId { get; }

    public FolderTree(Guid projectId, IEnumerable<Folder> rows)
    {
        ProjectId = projectId;
        folders = rows.Where(folder => folder.DeletedAtUtc is null).ToDictionary(folder => folder.Id);

        foreach (var folder in folders.Values)
        {
            ValidateRow(folder);
        }
    }

    public IReadOnlyList<Folder> Children(Guid? parentId)
    {
        return folders.Values
            .Where(folder => folder.ParentFolderId == parentId)
            .OrderBy(folder => folder.SortOrder)
            .ToArray();
    }

    public IReadOnlyList<Folder> Ancestors(Guid id)
    {
        var ancestors = new List<Folder>();
        var seen = new HashSet<Guid> { id };
        var current = Get(id);

        while (current.ParentFolderId is Guid parentId)
        {
            if (!seen.Add(parentId))
            {
                throw new InvalidOperationException("Folder cycle detected.");
            }

            current = Get(parentId);
            ancestors.Add(current);
        }

        return ancestors;
    }

    public IReadOnlyList<Folder> Descendants(Guid id)
    {
        return Walk(id).ToArray();
    }

    public Folder Get(Guid id)
    {
        if (!folders.TryGetValue(id, out var folder))
        {
            throw new InvalidOperationException("Folder is missing or deleted.");
        }

        return folder;
    }

    public void Add(Folder folder)
    {
        if (folder.ProjectId != ProjectId || folder.DeletedAtUtc is not null)
        {
            throw new InvalidOperationException("Folder must be active and in this project.");
        }

        if (folder.ParentFolderId is Guid parentId)
        {
            Get(parentId);
        }

        if (!folders.TryAdd(folder.Id, folder))
        {
            throw new InvalidOperationException("Duplicate folder.");
        }
    }

    /// <summary>Stamps an active folder branch with one deletion batch.</summary>
    public void DeleteSubtree(Guid id, Guid batchId, TimeProvider clock)
    {
        var branch = new[] { Get(id) }.Concat(Descendants(id)).ToArray();

        foreach (var folder in branch)
        {
            folder.Delete(batchId, clock);
            folders.Remove(folder.Id);
        }
    }

    public void Move(Guid id, Guid? parentId, TimeProvider clock)
    {
        var folder = Get(id);

        if (parentId is Guid newParentId)
        {
            Get(newParentId);

            if (newParentId == id || Descendants(id).Any(descendant => descendant.Id == newParentId))
            {
                throw new InvalidOperationException("Folder move would create a cycle.");
            }
        }

        folder.MoveTo(parentId, clock);
    }

    private void ValidateRow(Folder folder)
    {
        if (folder.ProjectId != ProjectId)
        {
            throw new InvalidOperationException("Folder belongs to another project.");
        }

        if (folder.ParentFolderId is Guid parentId && !folders.ContainsKey(parentId))
        {
            throw new InvalidOperationException("Folder parent is missing or deleted.");
        }

        Ancestors(folder.Id);
    }

    private IEnumerable<Folder> Walk(Guid id)
    {
        foreach (var child in Children(id))
        {
            yield return child;

            foreach (var descendant in Walk(child.Id))
            {
                yield return descendant;
            }
        }
    }
}