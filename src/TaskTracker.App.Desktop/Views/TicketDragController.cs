using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Threading;
using Avalonia.VisualTree;

using TaskTracker.Core.Tickets;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Views;

/// <summary>Translates ticket row and section edge drags into positions on the ticket board.</summary>
internal sealed class TicketDragController
{
    private const double DragThresholdSquared = 16;
    private const double ScrollEdgeSize = 48;
    private const double MaxScrollPerTick = 16;

    private readonly TicketsView view;
    private readonly DispatcherTimer scrollTimer = new() { Interval = TimeSpan.FromMilliseconds(16) };
    private TicketRowViewModel? source;
    private Border? sourceRow;
    private Point pressedAt;
    private Point dragPoint;
    private IPointer? pointer;
    private Border? highlighted;
    private TicketPosition? target;

    public TicketDragController(TicketsView view)
    {
        this.view = view;
        scrollTimer.Tick += OnScrollTick;
        view.AddHandler(InputElement.PointerPressedEvent, OnPressed, RoutingStrategies.Tunnel, true);
        view.AddHandler(InputElement.PointerMovedEvent, OnMoved, RoutingStrategies.Tunnel, true);
        view.AddHandler(InputElement.PointerReleasedEvent, OnReleased, RoutingStrategies.Tunnel, true);
        view.AddHandler(InputElement.PointerCaptureLostEvent, OnCaptureLost, RoutingStrategies.Direct);
    }

    public bool IsDragging => pointer is not null;

    public void Cancel()
    {
        scrollTimer.Stop();
        var captured = pointer;
        pointer = null;
        sourceRow?.Classes.Remove("dragging");
        sourceRow = null;
        source = null;
        ClearTarget();
        if (captured?.Captured == view)
        {
            captured.Capture(null);
        }
    }

    private void OnPressed(object? sender, PointerPressedEventArgs args)
    {
        if (source is not null ||
            args.GetCurrentPoint(view).Properties.PointerUpdateKind != PointerUpdateKind.LeftButtonPressed)
        {
            return;
        }

        sourceRow = FindTarget(args.Source as Visual, "ticketRow");
        source = sourceRow?.DataContext as TicketRowViewModel;
        pressedAt = args.GetPosition(view);
        sourceRow?.Focus();
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
        if (!IsDragging && !TryStartDrag(point, args.Pointer))
        {
            return;
        }

        dragPoint = point;
        UpdateTarget(point);
        if (ScrollDelta() == 0)
        {
            scrollTimer.Stop();
        }
        else
        {
            scrollTimer.Start();
        }

        args.Handled = true;
    }

    private bool TryStartDrag(Point point, IPointer draggingPointer)
    {
        var delta = point - pressedAt;
        if (delta.X * delta.X + delta.Y * delta.Y < DragThresholdSquared)
        {
            return false;
        }

        pointer = draggingPointer;
        draggingPointer.Capture(view);
        sourceRow?.Classes.Add("dragging");
        return true;
    }

    private async void OnReleased(object? sender, PointerReleasedEventArgs args)
    {
        if (args.InitialPressMouseButton != MouseButton.Left || args.GetCurrentPoint(view).Properties.IsLeftButtonPressed)
        {
            return;
        }

        if (!IsDragging)
        {
            Cancel();
            return;
        }

        UpdateTarget(args.GetPosition(view));
        var row = source;
        var position = target;
        Cancel();
        args.Handled = true;
        if (row is not null && position is not null && view.DataContext is TicketsViewModel page)
        {
            await page.MoveAsync(row, position);
        }
    }

    private void OnScrollTick(object? sender, EventArgs args)
    {
        var scroll = view.TicketList;
        var offset = scroll.Offset;
        var next = Math.Clamp(offset.Y + ScrollDelta(), 0, scroll.ScrollBarMaximum.Y);
        if (next == offset.Y)
        {
            scrollTimer.Stop();
            return;
        }

        scroll.Offset = new Vector(offset.X, next);
        scroll.UpdateLayout();
        if (IsDragging)
        {
            UpdateTarget(dragPoint);
        }
    }

    private double ScrollDelta()
    {
        var scroll = view.TicketList;
        var viewport = scroll.Viewport;
        var local = view.TranslatePoint(dragPoint, scroll);
        if (local is not { } point || !new Rect(viewport).Contains(point))
        {
            return 0;
        }

        var edge = Math.Min(ScrollEdgeSize, viewport.Height / 2);
        var top = Math.Max(0, edge - point.Y);
        var bottom = Math.Max(0, edge - (viewport.Height - point.Y));
        return edge > 0 ? MaxScrollPerTick * (bottom - top) / edge : 0;
    }

    private void OnCaptureLost(object? sender, PointerCaptureLostEventArgs args)
    {
        if (IsDragging)
        {
            Cancel();
        }
    }

    private void UpdateTarget(Point point)
    {
        ClearTarget();
        var hit = view.InputHitTest(point) as Visual;
        var border = FindTarget(hit, "ticketRow") ?? FindTarget(hit, "ticketSection");
        var position = GetPosition(border, point);
        if (border is null || position is null || source is null ||
            view.DataContext is not TicketsViewModel page || !page.CanDrop(source, position))
        {
            return;
        }

        target = position;
        highlighted = border;
        border.Classes.Add(position.AnchorId is null || position.After ? "dropAfter" : "dropBefore");
    }

    private TicketPosition? GetPosition(Border? border, Point point)
    {
        if (border?.DataContext is TicketSectionViewModel section)
        {
            return new TicketPosition(section.PriorityId);
        }

        if (border?.DataContext is TicketRowViewModel row && view.TranslatePoint(point, border) is { } local)
        {
            return new TicketPosition(row.PriorityId, row.Id, After: local.Y >= border.Bounds.Height / 2);
        }

        return null;
    }

    private void ClearTarget()
    {
        highlighted?.Classes.Remove("dropBefore");
        highlighted?.Classes.Remove("dropAfter");
        highlighted = null;
        target = null;
    }

    private static Border? FindTarget(Visual? hit, string styleClass)
    {
        return hit?.GetSelfAndVisualAncestors().OfType<Border>()
            .FirstOrDefault(border => border.Classes.Contains(styleClass));
    }
}