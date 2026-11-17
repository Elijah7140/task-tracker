namespace TaskTracker.Presentation.ViewModels;

/// <summary>Pure pointer-to-time math for dragging entries in the calendar.</summary>
public static class CalendarDropMapper
{
    /// <summary>
    /// Turns a pointer position inside a day column into the start time of the dragged block.
    /// The block's top edge is where the pointer is minus <paramref name="grabOffset"/>, so the block
    /// does not jump when it is picked up away from its top. The result is snapped to
    /// <see cref="CalendarMetrics.SnapMinutes"/> minutes and kept between 00:00 and 23:45.
    /// </summary>
    /// <param name="pointerY">Pointer distance from the top of the day column.</param>
    /// <param name="grabOffset">Distance from the dragged block's top edge to the pointer when it was picked up.</param>
    public static TimeOnly SnapStart(double pointerY, double grabOffset)
    {
        var topMinutes = (pointerY - grabOffset) / CalendarMetrics.PixelsPerMinute;
        var steps = Math.Round(topMinutes / CalendarMetrics.SnapMinutes, MidpointRounding.AwayFromZero);
        var snappedMinutes = (int)(steps * CalendarMetrics.SnapMinutes);
        return FromMinutes(snappedMinutes);
    }

    /// <summary>Converts minutes since midnight to a time, kept between 00:00 and 23:45.</summary>
    public static TimeOnly FromMinutes(int minutes)
    {
        var clamped = Math.Clamp(minutes, 0, CalendarMetrics.LastSnapMinute);
        return new TimeOnly(clamped / 60, clamped % 60);
    }

    /// <summary>True once the pointer has moved far enough from where it was pressed to count as a drag.</summary>
    public static bool IsDrag(double pressedX, double pressedY, double currentX, double currentY)
    {
        var deltaX = currentX - pressedX;
        var deltaY = currentY - pressedY;
        var distance = Math.Sqrt(deltaX * deltaX + deltaY * deltaY);
        return distance >= CalendarMetrics.DragThreshold;
    }
}