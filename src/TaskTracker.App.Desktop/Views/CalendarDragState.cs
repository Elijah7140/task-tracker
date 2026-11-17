namespace TaskTracker.App.Desktop.Views;

/// <summary>Where a pointer gesture on a calendar entry currently is.</summary>
internal enum CalendarDragState
{
    /// <summary>No entry is pressed.</summary>
    Idle,

    /// <summary>The left button went down on an entry but the pointer has not moved far enough to drag.</summary>
    Armed,

    /// <summary>The entry is being dragged and the pointer belongs to the calendar.</summary>
    Dragging
}