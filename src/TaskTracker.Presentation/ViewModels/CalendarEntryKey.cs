using TaskTracker.Core.Calendar;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Identifies an entry across reloads: the item and why it is on the calendar.</summary>
public readonly record struct CalendarEntryKey(Guid ItemId, CalendarEntryKind Kind);