using TaskTracker.Core.Projects;

namespace TaskTracker.Core.Persistence;

/// <summary>Loads and tracks projects, including deletion batches.</summary>
public interface IProjectRepository
{
    Task<IReadOnlyList<Project>> ListAsync(bool includeDeleted, CancellationToken cancellationToken);

    Task<Project?> FindAsync(Guid id, bool includeDeleted, CancellationToken cancellationToken);

    void Add(Project project);
}