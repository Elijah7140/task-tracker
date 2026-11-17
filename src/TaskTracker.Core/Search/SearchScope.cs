namespace TaskTracker.Core.Search;

/// <summary>The projects and area included in a search.</summary>
public abstract record SearchScope
{
    /// <summary>Searches every active project.</summary>
    public sealed record AllProjects : SearchScope;

    /// <summary>Searches one project.</summary>
    public sealed record Project(Guid ProjectId) : SearchScope;

    /// <summary>Searches an area within one project.</summary>
    public sealed record Area(Guid ProjectId, Guid? FolderId, bool IncludeSubfolders) : SearchScope;
}