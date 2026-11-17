using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;

namespace TaskTracker.Core.Trash;

/// <summary>
/// Finds deleted rows and removes them for good. Every query here opts out of the deletion
/// filter, which is what makes it the one place that can see the trash.
/// </summary>
public interface ITrashRepository
{
    /// <summary>
    /// Lists the projects that have at least one deleted row (the project itself, a folder or
    /// an item), or only the given project when it has one.
    /// </summary>
    Task<IReadOnlyList<Guid>> ListProjectIdsWithDeletionsAsync(Guid? projectId, CancellationToken cancellationToken);

    /// <summary>Finds the project that owns a deletion batch, or null when no row carries that batch.</summary>
    Task<Guid?> FindProjectIdAsync(Guid batchId, CancellationToken cancellationToken);

    /// <summary>Marks a project row for permanent removal.</summary>
    void Remove(Project project);

    /// <summary>Marks a folder row for permanent removal.</summary>
    void Remove(Folder folder);

    /// <summary>Marks an item row for permanent removal; its custom values and search rows go with it.</summary>
    void Remove(TodoItem item);

    /// <summary>
    /// Marks everything a project owns besides folders and items for removal: its own custom
    /// fields (with their choices and values) and its setting overrides.
    /// </summary>
    Task RemoveProjectOwnedDataAsync(Guid projectId, CancellationToken cancellationToken);
}