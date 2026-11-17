namespace TaskTracker.Core.SavedSearches;

/// <summary>How widely a saved search looks; mirrors the search scope variants.</summary>
public enum SavedSearchScopeKind
{
    /// <summary>Every active project.</summary>
    AllProjects,

    /// <summary>One project.</summary>
    Project,

    /// <summary>One folder of a project (or the project root when no folder is stored).</summary>
    Folder
}