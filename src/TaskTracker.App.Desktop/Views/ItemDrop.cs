using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Views;

/// <summary>Describes where a dragged item would be dropped, and applies the drop.</summary>
internal readonly struct ItemDrop
{
    private readonly ItemDropKind kind;
    private readonly Guid draggedId;
    private readonly Guid rowId;
    private readonly Guid? folderId;
    private readonly ItemDropPosition position;

    private ItemDrop(ItemDropKind kind, Guid draggedId, Guid rowId, Guid? folderId, ItemDropPosition position)
    {
        this.kind = kind;
        this.draggedId = draggedId;
        this.rowId = rowId;
        this.folderId = folderId;
        this.position = position;
    }

    /// <summary>A drop before, after, or inside another item row.</summary>
    public static ItemDrop OnRow(Guid draggedId, Guid rowId, ItemDropPosition position)
    {
        return new ItemDrop(ItemDropKind.OnRow, draggedId, rowId, null, position);
    }

    /// <summary>A drop on a folder; a null folder ID means the project root.</summary>
    public static ItemDrop OnFolder(Guid draggedId, Guid? folderId)
    {
        return new ItemDrop(ItemDropKind.OnFolder, draggedId, Guid.Empty, folderId, ItemDropPosition.Into);
    }

    /// <summary>A drop on the empty end of the item list.</summary>
    public static ItemDrop AtRootEnd(Guid draggedId)
    {
        return new ItemDrop(ItemDropKind.AtRootEnd, draggedId, Guid.Empty, null, ItemDropPosition.After);
    }

    /// <summary>Asks the workspace to perform the move this drop describes.</summary>
    public Task ApplyAsync(ProjectWorkspaceViewModel workspace)
    {
        return kind switch
        {
            ItemDropKind.OnRow => workspace.DropItemAsync(draggedId, rowId, position),
            ItemDropKind.OnFolder => workspace.DropItemOnFolderAsync(draggedId, folderId),
            _ => workspace.DropItemAtRootEndAsync(draggedId)
        };
    }
}