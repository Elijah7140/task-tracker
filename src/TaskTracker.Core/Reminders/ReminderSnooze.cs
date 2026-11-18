namespace TaskTracker.Core.Reminders;

/// <summary>The available ways to defer a delivered reminder.</summary>
public enum ReminderSnooze
{
    TenMinutes,
    OneHour,
    Tomorrow,
}