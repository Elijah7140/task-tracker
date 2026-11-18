namespace TaskTracker.Presentation.Reminders;

/// <summary>A platform notification. A null item opens the reminder panel.</summary>
public sealed record ReminderNotification(string Title, string Body, Guid? ItemId);