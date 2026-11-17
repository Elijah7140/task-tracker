using System.Diagnostics;

using TaskTracker.Presentation.Reminders;

namespace TaskTracker.App.Desktop.Reminders;

/// <summary>Adapts the platform notifier and leaves the in-app panel available on failure.</summary>
internal sealed class DesktopReminderNotifier : IReminderNotifier, IDisposable
{
    private IReminderNotifier? platform;
    private bool failed;

    public void Use(IReminderNotifier? notifier)
    {
        platform = notifier;
    }

    public async Task NotifyAsync(ReminderNotification notification, CancellationToken cancellationToken)
    {
        if (platform is null || failed)
        {
            return;
        }

        try
        {
            await platform.NotifyAsync(notification, cancellationToken);
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            ReportFailure(exception);
        }
    }

    public void ReportFailure(Exception exception)
    {
        if (!failed)
        {
            failed = true;
            Trace.TraceWarning($"Platform reminders unavailable: {exception.Message}");
        }
    }

    public void Dispose()
    {
        (platform as IDisposable)?.Dispose();
        platform = null;
    }
}