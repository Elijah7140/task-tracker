using Avalonia;
using Avalonia.Input;
using Avalonia.Interactivity;

using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Views;

/// <summary>
/// Turns pointer input on calendar entries into drops. A left press on an entry arms a drag; a press
/// that moves less than <see cref="CalendarMetrics.DragThreshold"/> pixels stays a click. Past that the
/// pointer is captured by the calendar, the drop indicator follows it, and releasing the left button
/// drops the entry. Escape, a lost button or a lost capture ends the drag without moving anything.
/// All time and date decisions are made by Presentation.
/// </summary>
internal sealed class CalendarDragController
{
    private readonly CalendarView view;
    private readonly CalendarDropIndicator indicator;
    private CalendarDragState state;
    private CalendarEntryViewModel? pressedEntry;
    private Point pressPoint;
    private Point lastPoint;
    private double grabOffset;
    private IPointer? activePointer;
    private CalendarDropTarget? target;

    public CalendarDragController(CalendarView view, CalendarDropIndicator indicator)
    {
        this.view = view;
        this.indicator = indicator;
        view.AddHandler(InputElement.PointerPressedEvent, OnPointerPressed, RoutingStrategies.Tunnel, true);
        view.AddHandler(InputElement.PointerMovedEvent, OnPointerMoved, RoutingStrategies.Tunnel, true);
        view.AddHandler(InputElement.PointerReleasedEvent, OnPointerReleased, RoutingStrategies.Tunnel, true);
        view.AddHandler(InputElement.PointerCaptureLostEvent, OnPointerCaptureLost, RoutingStrategies.Direct);
    }

    /// <summary>True while an entry is being dragged.</summary>
    public bool IsDragging => state == CalendarDragState.Dragging;

    /// <summary>Abandons the drag in progress without moving anything (Escape, leaving the page).</summary>
    public void Cancel()
    {
        EndDrag();
    }

    /// <summary>
    /// Recomputes the drop target after the week grid scrolled under a stationary pointer, so the
    /// ghost block shows the time that is now under it.
    /// </summary>
    public void RefreshAfterScroll()
    {
        if (IsDragging)
        {
            UpdateTarget(lastPoint);
        }
    }

    private void OnPointerPressed(object? sender, PointerPressedEventArgs args)
    {
        if (IsDragging)
        {
            return;
        }

        var entryButton = CalendarEntryButton.From(args.Source);

        if (!args.GetCurrentPoint(view).Properties.IsLeftButtonPressed || entryButton is null)
        {
            Disarm();
            return;
        }

        state = CalendarDragState.Armed;
        pressedEntry = entryButton.Entry;
        pressPoint = args.GetPosition(view);
        grabOffset = entryButton.Entry.IsAllDay ? 0 : args.GetPosition(entryButton.Button).Y;
    }

    private void OnPointerMoved(object? sender, PointerEventArgs args)
    {
        if (state == CalendarDragState.Idle)
        {
            return;
        }

        if (!args.GetCurrentPoint(view).Properties.IsLeftButtonPressed)
        {
            EndDrag();
            return;
        }

        var point = args.GetPosition(view);

        if (state == CalendarDragState.Armed && !CalendarDropMapper.IsDrag(pressPoint.X, pressPoint.Y, point.X, point.Y))
        {
            return;
        }

        if (state == CalendarDragState.Armed)
        {
            BeginDrag(args.Pointer);
        }

        UpdateTarget(point);
        args.Handled = true;
    }

    private async void OnPointerReleased(object? sender, PointerReleasedEventArgs args)
    {
        if (args.InitialPressMouseButton != MouseButton.Left)
        {
            return;
        }

        if (!IsDragging)
        {
            Disarm();
            return;
        }

        UpdateTarget(args.GetPosition(view));
        var drop = EndDragWithDrop();
        args.Handled = true;

        if (drop is not null && view.DataContext is CalendarViewModel calendar)
        {
            await calendar.MoveEntryAsync(drop.Value.Entry, drop.Value.Target);
        }
    }

    private void OnPointerCaptureLost(object? sender, PointerCaptureLostEventArgs args)
    {
        if (IsDragging)
        {
            EndDrag();
        }
    }

    private void BeginDrag(IPointer pointer)
    {
        state = CalendarDragState.Dragging;
        activePointer = pointer;
        pointer.Capture(view);
        view.Cursor = new Cursor(StandardCursorType.DragMove);
    }

    /// <summary>Ends the drag and returns what to drop, or null when the pointer is not over a drop area.</summary>
    private (CalendarEntryViewModel Entry, CalendarDropTarget Target)? EndDragWithDrop()
    {
        var entry = pressedEntry;
        var drop = target;
        EndDrag();

        if (entry is null || drop is null)
        {
            return null;
        }

        return (entry, drop.Value);
    }

    /// <summary>Ends any press or drag: clears the indicator and cursor and gives the pointer back.</summary>
    private void EndDrag()
    {
        var pointer = activePointer;
        Disarm();
        target = null;
        activePointer = null;
        indicator.Clear();
        view.Cursor = null;
        pointer?.Capture(null);
    }

    private void Disarm()
    {
        state = CalendarDragState.Idle;
        pressedEntry = null;
    }

    private void UpdateTarget(Point point)
    {
        lastPoint = point;
        target = null;
        indicator.Clear();
        var hit = CalendarDropHit.Find(view, point);

        if (hit is null || pressedEntry is null || !CalendarReschedule.Accepts(pressedEntry, hit.Zone))
        {
            return;
        }

        if (hit.Zone == CalendarDropZone.TimeGrid)
        {
            ShowTimeGridTarget(hit, point, pressedEntry);
            return;
        }

        target = new CalendarDropTarget(hit.Zone, hit.Day.Date, null);
        indicator.ShowCell(hit.Host);
    }

    private void ShowTimeGridTarget(CalendarDropHit hit, Point point, CalendarEntryViewModel entry)
    {
        var pointerY = view.TranslatePoint(point, hit.Host)?.Y ?? 0;
        var start = CalendarDropMapper.SnapStart(pointerY, grabOffset);
        target = new CalendarDropTarget(hit.Zone, hit.Day.Date, start);
        indicator.ShowGhost(hit.Host, start, entry.Height);
    }
}