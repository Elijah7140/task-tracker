using System.Diagnostics;

using TaskTracker.Presentation.Reminders;

namespace TaskTracker.App.Desktop.Reminders;

/// <summary>
/// Adapts the platform notifier and leaves the in-app panel available on failure. After a failure
/// it logs once, skips platform notifications for <see cref="RetryDelay"/>, then tries again.
/// </summary>
internal sealed class DesktopReminderNotifier(TimeProvider clock) : IReminderNotifier, IDisposable
{
    public static readonly TimeSpan RetryDelay = TimeSpan.FromMinutes(5);

    private IReminderNotifier? platform;
    private DateTimeOffset? retryAfter;
    private bool failureLogged;

    public void Use(IReminderNotifier? notifier)
    {
        platform = notifier;
    }

    public async Task NotifyAsync(ReminderNotification notification, CancellationToken cancellationToken)
    {
        if (platform is null || IsCoolingDown())
        {
            return;
        }

        try
        {
            await platform.NotifyAsync(notification, cancellationToken);
            retryAfter = null;
            failureLogged = false;
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            ReportFailure(exception);
        }
    }

    public void ReportFailure(Exception exception)
    {
        retryAfter = clock.GetUtcNow() + RetryDelay;
        if (!failureLogged)
        {
            failureLogged = true;
            Trace.TraceWarning($"Platform reminders unavailable; retrying after {RetryDelay}: {exception.Message}");
        }
    }

    private bool IsCoolingDown()
    {
        return retryAfter is { } until && clock.GetUtcNow() < until;
    }

    public void Dispose()
    {
        (platform as IDisposable)?.Dispose();
        platform = null;
    }
}