namespace TaskTracker.App.Desktop.Views;

/// <summary>What a dragged item row was released on.</summary>
internal enum ItemDropKind
{
    /// <summary>Another item row: before, after, or inside it.</summary>
    OnRow,

    /// <summary>A folder in the folder tree, or the project root.</summary>
    OnFolder,

    /// <summary>The empty end of the item list, which promotes a sub-item to top level.</summary>
    AtRootEnd
}