using TaskTracker.Core.Projects;

namespace TaskTracker.Core.Persistence;

/// <summary>Loads and tracks folders within a project.</summary>
public interface IFolderRepository
{
    Task<IReadOnlyList<Folder>> ListAsync(Guid projectId, bool includeDeleted, CancellationToken cancellationToken);

    void Add(Folder folder);
}