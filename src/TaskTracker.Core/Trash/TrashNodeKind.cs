namespace TaskTracker.Core.Trash;

/// <summary>The kind of node a deletion batch started from.</summary>
public enum TrashNodeKind
{
    Project,
    Folder,
    Item
}