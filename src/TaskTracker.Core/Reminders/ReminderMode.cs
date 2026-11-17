namespace TaskTracker.Core.Reminders;

/// <summary>An explicit item choice. A null mode inherits the effective default.</summary>
public enum ReminderMode
{
    None = 1,
    Offset = 2,
}