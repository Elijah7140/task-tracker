namespace TaskTracker.Presentation.Reminders;

/// <summary>Posts one optional platform notification. The in-app panel is updated separately.</summary>
public interface IReminderNotifier
{
    Task NotifyAsync(ReminderNotification notification, CancellationToken cancellationToken);
}