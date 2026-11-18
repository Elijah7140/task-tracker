using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Presenters;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.VisualTree;

using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Views;

/// <summary>Translates captured item row drags into workspace item moves.</summary>
internal sealed class ItemDragController
{
    private const double DragThresholdSquared = 16;
    private const string RowClass = "itemRow";
    private const string CardClass = "itemCard";

    private readonly ProjectWorkspaceView view;
    private ItemRowViewModel? source;
    private Border? sourceRow;
    private Point pressPoint;
    private IPointer? pointer;
    private Control? highlighted;
    private string? highlightClass;
    private ItemDrop? pendingDrop;

    public ItemDragController(ProjectWorkspaceView view)
    {
        this.view = view;
        view.AddHandler(InputElement.PointerPressedEvent, OnPressed, RoutingStrategies.Tunnel, true);
        view.AddHandler(InputElement.PointerMovedEvent, OnMoved, RoutingStrategies.Tunnel, true);
        view.AddHandler(InputElement.PointerReleasedEvent, OnReleased, RoutingStrategies.Tunnel, true);
        view.AddHandler(InputElement.PointerCaptureLostEvent, OnCaptureLost, RoutingStrategies.Direct);
    }

    public bool IsDragging => pointer is not null;

    /// <summary>Ends the gesture without dropping anything and removes all drag feedback.</summary>
    public void Cancel()
    {
        var captured = pointer;
        pointer = null;
        ClearDrop();
        ClearSource();
        view.Cursor = null;
        captured?.Capture(null);
    }

    private void OnPressed(object? sender, PointerPressedEventArgs args)
    {
        var isLeftPress = args.GetCurrentPoint(view).Properties.PointerUpdateKind ==
            PointerUpdateKind.LeftButtonPressed;

        if (!isLeftPress || source is not null)
        {
            return;
        }

        sourceRow = FindItemRow(args.Source);
        source = sourceRow?.DataContext as ItemRowViewModel;
        pressPoint = args.GetPosition(view);
    }

    private void OnMoved(object? sender, PointerEventArgs args)
    {
        if (source is null)
        {
            return;
        }

        if (!args.GetCurrentPoint(view).Properties.IsLeftButtonPressed)
        {
            Cancel();
            return;
        }

        var point = args.GetPosition(view);

        if (pointer is null && !HasPassedDragThreshold(point))
        {
            return;
        }

        if (pointer is null)
        {
            BeginDrag(args.Pointer);
        }

        UpdateDrop(point);
        args.Handled = true;
    }

    private bool HasPassedDragThreshold(Point point)
    {
        var distance = point - pressPoint;
        return distance.X * distance.X + distance.Y * distance.Y >= DragThresholdSquared;
    }

    private void BeginDrag(IPointer draggingPointer)
    {
        pointer = draggingPointer;
        draggingPointer.Capture(view);
        sourceRow?.Classes.Add("dragging");
    }

    private async void OnReleased(object? sender, PointerReleasedEventArgs args)
    {
        if (args.InitialPressMouseButton != MouseButton.Left)
        {
            return;
        }

        var drop = CompleteGesture(args);

        if (drop is not null && view.DataContext is ProjectWorkspaceViewModel workspace)
        {
            await drop.Value.ApplyAsync(workspace);
        }
    }

    /// <summary>Ends the gesture and returns the drop to apply; null for a click or an invalid target.</summary>
    private ItemDrop? CompleteGesture(PointerReleasedEventArgs args)
    {
        if (pointer is null)
        {
            ClearSource();
            return null;
        }

        UpdateDrop(args.GetPosition(view));
        var drop = pendingDrop;
        Cancel();
        args.Handled = true;
        return drop;
    }

    private void OnCaptureLost(object? sender, PointerCaptureLostEventArgs args)
    {
        if (pointer is not null)
        {
            Cancel();
        }
    }

    private void ClearSource()
    {
        sourceRow?.Classes.Remove("dragging");
        sourceRow = null;
        source = null;
    }

    private void UpdateDrop(Point point)
    {
        ClearDrop();
        var hit = view.InputHitTest(point);
        var rowBorder = FindItemRow(hit) ?? FindRowAt(point);

        if (rowBorder is not null)
        {
            ShowRowDrop(rowBorder, point);
            return;
        }

        var hasTarget = TryShowGroupDrop(hit) || TryShowFolderDrop(hit) || TryShowRootEndDrop(point);
        SetCursor(hasTarget ? StandardCursorType.DragMove : StandardCursorType.No);
    }

    private void ShowRowDrop(Border border, Point point)
    {
        var local = view.TranslatePoint(point, border);

        if (local is null || source is null || border.DataContext is not ItemRowViewModel row ||
            view.DataContext is not ProjectWorkspaceViewModel workspace)
        {
            SetCursor(StandardCursorType.No);
            return;
        }

        var position = border.Classes.Contains(CardClass)
            ? PositionAcross(local.Value.X, border.Bounds.Width)
            : PositionAcross(local.Value.Y, border.Bounds.Height);

        if (!workspace.CanDropItem(source.Id, row.Id, position))
        {
            SetCursor(StandardCursorType.No);
            return;
        }

        pendingDrop = ItemDrop.OnRow(source.Id, row.Id, position);
        Highlight(border, RowDropClass(position));
        SetCursor(StandardCursorType.DragMove);
    }

    private bool TryShowFolderDrop(object? hit)
    {
        var treeItem = FindAncestor<TreeViewItem>(hit);

        if (treeItem?.DataContext is not FolderNodeViewModel folder || source is null ||
            source.ParentId is not null)
        {
            return false;
        }

        pendingDrop = ItemDrop.OnFolder(source.Id, folder.Id);
        Highlight(treeItem, "dropFolder");
        return true;
    }

    private bool TryShowRootEndDrop(Point point)
    {
        var scroll = view.ItemScrollViewer;

        if (source?.ParentId is null || !BoundsInView(scroll).Contains(point))
        {
            return false;
        }

        pendingDrop = ItemDrop.AtRootEnd(source.Id);
        Highlight(scroll, "dropRoot");
        return true;
    }

    private static string RowDropClass(ItemDropPosition position)
    {
        return position switch
        {
            ItemDropPosition.Before => "dropBefore",
            ItemDropPosition.After => "dropAfter",
            _ => "dropInto"
        };
    }

    /// <summary>
    /// Splits a target into thirds along the direction items flow: top to bottom for rows, left to
    /// right for cards. The first third inserts before, the middle third makes a sub-item, and the
    /// last third inserts after.
    /// </summary>
    private static ItemDropPosition PositionAcross(double offset, double length)
    {
        if (offset < length / 3)
        {
            return ItemDropPosition.Before;
        }

        if (offset > length * 2 / 3)
        {
            return ItemDropPosition.After;
        }

        return ItemDropPosition.Into;
    }

    private bool TryShowGroupDrop(object? hit)
    {
        var header = FindAncestor<Border>(hit, border => border.Classes.Contains("groupHeader"));

        if (header?.DataContext is not PriorityGroupViewModel group || source is null ||
            view.DataContext is not ProjectWorkspaceViewModel workspace ||
            !workspace.CanDropOnGroup(source.Id, group))
        {
            return false;
        }

        pendingDrop = ItemDrop.OnGroup(source.Id, group);
        Highlight(header, "dropGroup");
        return true;
    }

    private void Highlight(Control control, string styleClass)
    {
        control.Classes.Add(styleClass);
        highlighted = control;
        highlightClass = styleClass;
    }

    private void ClearDrop()
    {
        if (highlighted is not null && highlightClass is not null)
        {
            highlighted.Classes.Remove(highlightClass);
        }

        highlighted = null;
        highlightClass = null;
        pendingDrop = null;
    }

    private void SetCursor(StandardCursorType type)
    {
        view.Cursor = new Cursor(type);
    }

    private static T? FindAncestor<T>(object? start) where T : Control
    {
        if (start is T match)
        {
            return match;
        }

        return (start as Visual)?.GetVisualAncestors().OfType<T>().FirstOrDefault();
    }

    private static T? FindAncestor<T>(object? start, Func<T, bool> match) where T : Control
    {
        if (start is T self && match(self))
        {
            return self;
        }

        return (start as Visual)?.GetVisualAncestors().OfType<T>().FirstOrDefault(match);
    }

    /// <summary>True for a sub-item row or a card: the borders an item drag starts from and drops on.</summary>
    internal static bool IsItemTarget(Border border)
    {
        return border.Classes.Contains(RowClass) || border.Classes.Contains(CardClass);
    }

    /// <summary>Finds the nearest row or card around a visual, so a sub-item row inside a card wins.</summary>
    private static Border? FindItemRow(object? start)
    {
        return FindAncestor<Border>(start, IsItemTarget);
    }

    /// <summary>
    /// Finds the row under a point when hit testing landed between or beside rows. Only rows
    /// that are actually visible there count: not rows scrolled out of the item list's viewport
    /// and not rows hidden by any clipping ancestor.
    /// </summary>
    private Border? FindRowAt(Point point)
    {
        if (!BoundsInView(view.ItemScrollViewer).Contains(point))
        {
            return null;
        }

        return view.ItemScrollViewer.GetVisualDescendants().OfType<Border>()
            .FirstOrDefault(border => IsVisibleRowAt(border, point));
    }

    private bool IsVisibleRowAt(Border border, Point point)
    {
        return IsItemTarget(border) &&
            border.IsEffectivelyVisible &&
            BoundsInView(border).Contains(point) &&
            !IsClippedAway(border, point);
    }

    private bool IsClippedAway(Visual visual, Point point)
    {
        foreach (var ancestor in visual.GetVisualAncestors())
        {
            var clips = ancestor is ScrollContentPresenter || (ancestor as Control)?.ClipToBounds == true;

            if (clips && !BoundsInView(ancestor).Contains(point))
            {
                return true;
            }
        }

        return false;
    }

    private Rect BoundsInView(Visual visual)
    {
        var origin = visual.TranslatePoint(new Point(0, 0), view);

        return origin is null ? default : new Rect(origin.Value, visual.Bounds.Size);
    }
}