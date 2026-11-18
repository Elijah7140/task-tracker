using TaskTracker.Core.Items;

namespace TaskTracker.Core.Persistence;

/// <summary>Loads complete areas so hierarchy and restore rules can see deleted rows.</summary>
public interface IItemRepository
{
    Task<IReadOnlyList<TodoItem>> LoadAreaAsync(Guid projectId, Guid? folderId, CancellationToken cancellationToken);

    Task<IReadOnlyList<TodoItem>> LoadProjectAsync(Guid projectId, CancellationToken cancellationToken);

    Task<TodoItem?> FindAsync(Guid id, CancellationToken cancellationToken);

    void Add(TodoItem item);

    /// <summary>The links of one item in display order.</summary>
    /// <summary>Gets the item's links in their current unit-of-work order, including pending edits.</summary>
    Task<IReadOnlyList<ItemLink>> LinksAsync(Guid itemId, CancellationToken cancellationToken);

    /// <summary>The links of every item of one project, deleted items included; callers filter by item.</summary>
    Task<IReadOnlyList<ItemLink>> LinksForProjectAsync(Guid projectId, CancellationToken cancellationToken);

    void Add(ItemLink link);

    void Remove(ItemLink link);
}