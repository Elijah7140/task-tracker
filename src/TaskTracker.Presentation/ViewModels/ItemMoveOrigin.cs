namespace TaskTracker.Presentation.ViewModels;

/// <summary>What the workspace showed when an item move began, to detect stale completions.</summary>
/// <param name="AreaVersion">Counts area changes; a different value means the user navigated.</param>
/// <param name="FolderId">The folder (null for the project root) the move was started in.</param>
/// <param name="SelectedItemId">The item that was selected when the move began.</param>
/// <param name="SelectionVersion">Counts selection requests, including a return to the same item.</param>
internal readonly record struct ItemMoveOrigin(int AreaVersion, Guid? FolderId, Guid? SelectedItemId,
    int SelectionVersion);