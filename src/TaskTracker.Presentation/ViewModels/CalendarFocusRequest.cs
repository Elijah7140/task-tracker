namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// Asks the view to focus a moved entry after the reload. <paramref name="Day"/> is the day it moved to,
/// so the view can fall back to that day's "+N more" button, or to Previous or Next when the day is
/// outside the visible period.
/// </summary>
public readonly record struct CalendarFocusRequest(CalendarEntryKey Key, DateOnly Day);