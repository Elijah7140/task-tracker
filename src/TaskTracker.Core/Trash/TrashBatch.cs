namespace TaskTracker.Core.Trash;

/// <summary>One deletion batch as the trash lists it: what was deleted together, and where it was.</summary>
/// <param name="BatchId">The shared <c>DeletionBatchId</c> of every row in the batch.</param>
/// <param name="Kind">The kind of the batch's top node.</param>
/// <param name="TopNodeId">The id of the project, folder or item that was deleted directly.</param>
/// <param name="Title">The top node's name or title.</param>
/// <param name="ProjectId">The project the batch belongs to.</param>
/// <param name="Path">
/// Names from the project down to the top node's parent, including parents that are deleted
/// themselves. Empty for a project.
/// </param>
/// <param name="DeletedAtUtc">When the top node was deleted.</param>
/// <param name="FolderCount">Folders in the batch, including the top node when it is a folder.</param>
/// <param name="ItemCount">Items and sub-items in the batch, including the top node when it is an item.</param>
/// <param name="RestoreBlockedReason">Why the batch cannot be restored yet, or null when it can.</param>
public sealed record TrashBatch(
    Guid BatchId,
    TrashNodeKind Kind,
    Guid TopNodeId,
    string Title,
    Guid ProjectId,
    IReadOnlyList<string> Path,
    DateTime DeletedAtUtc,
    int FolderCount,
    int ItemCount,
    string? RestoreBlockedReason)
{
    /// <summary>True when the batch can be restored now.</summary>
    public bool CanRestore => RestoreBlockedReason is null;
}