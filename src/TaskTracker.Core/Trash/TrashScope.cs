namespace TaskTracker.Core.Trash;

/// <summary>Which deletion batches the trash covers: every project, or the batches of one project.</summary>
/// <param name="ProjectId">The project to cover, or null for all projects.</param>
public sealed record TrashScope(Guid? ProjectId)
{
    /// <summary>The batches of every project, including deleted projects.</summary>
    public static TrashScope AllProjects { get; } = new TrashScope((Guid?)null);

    /// <summary>The batches inside one project.</summary>
    public static TrashScope ForProject(Guid projectId)
    {
        return new TrashScope(projectId);
    }
}