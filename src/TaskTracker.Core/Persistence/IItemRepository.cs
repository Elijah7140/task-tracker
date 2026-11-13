using TaskTracker.Core.Items;

namespace TaskTracker.Core.Persistence;

/// <summary>Loads complete areas so hierarchy and restore rules can see deleted rows.</summary>
public interface IItemRepository
{
    Task<IReadOnlyList<TodoItem>> LoadAreaAsync(Guid projectId, Guid? folderId, CancellationToken cancellationToken);

    Task<IReadOnlyList<TodoItem>> LoadProjectAsync(Guid projectId, CancellationToken cancellationToken);

    Task<TodoItem?> FindAsync(Guid id, CancellationToken cancellationToken);

    void Add(TodoItem item);
}