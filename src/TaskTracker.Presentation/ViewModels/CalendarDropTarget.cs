namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// Where an entry was dropped. <paramref name="Time"/> is the snapped start time and is only
/// used for <see cref="CalendarDropZone.TimeGrid"/>.
/// </summary>
public readonly record struct CalendarDropTarget(CalendarDropZone Zone, DateOnly Day, TimeOnly? Time);