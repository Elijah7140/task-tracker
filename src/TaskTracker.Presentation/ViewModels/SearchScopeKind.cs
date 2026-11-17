namespace TaskTracker.Presentation.ViewModels;

/// <summary>How widely a search looks.</summary>
public enum SearchScopeKind
{
    /// <summary>Every active project.</summary>
    AllProjects,

    /// <summary>The project the search was opened from.</summary>
    Project,

    /// <summary>Only items directly in the project, outside folders.</summary>
    Root,

    /// <summary>The folder the search was opened from.</summary>
    Folder
}