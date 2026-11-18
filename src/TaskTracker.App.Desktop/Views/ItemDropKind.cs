namespace TaskTracker.App.Desktop.Views;

/// <summary>What a dragged item row or card was released on.</summary>
internal enum ItemDropKind
{
    /// <summary>Another item row or card: before, after, or inside it.</summary>
    OnRow,

    /// <summary>A folder in the folder tree, or the project root.</summary>
    OnFolder,

    /// <summary>The empty end of the item list, which promotes a sub-item to top level.</summary>
    AtRootEnd,

    /// <summary>A priority section's header, which appends the item to that section.</summary>
    OnGroup
}