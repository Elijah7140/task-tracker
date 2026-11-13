namespace TaskTracker.Core.Projects;

/// <summary>A project's name and active folders read in one operation.</summary>
public sealed record ProjectWorkspaceSnapshot(string Name, FolderTree Folders);