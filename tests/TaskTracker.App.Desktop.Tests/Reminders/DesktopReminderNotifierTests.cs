using Microsoft.Extensions.Time.Testing;

using TaskTracker.App.Desktop.Reminders;
using TaskTracker.Presentation.Reminders;

namespace TaskTracker.App.Desktop.Tests.Reminders;

/// <summary>Checks that a platform failure pauses native notifications for a while instead of for the session.</summary>
public sealed class DesktopReminderNotifierTests
{
    private static readonly ReminderNotification Notification = new("Review invoices", "Operations", Guid.NewGuid());

    [Fact]
    public async Task A_failure_pauses_platform_notifications_until_the_cool_down_ends()
    {
        var clock = new FakeTimeProvider();
        var platform = new FlakyNotifier { FailuresLeft = 1 };
        using var notifier = new DesktopReminderNotifier(clock);
        notifier.Use(platform);

        await notifier.NotifyAsync(Notification, TestContext.Current.CancellationToken);
        await notifier.NotifyAsync(Notification, TestContext.Current.CancellationToken);
        clock.Advance(DesktopReminderNotifier.RetryDelay);
        await notifier.NotifyAsync(Notification, TestContext.Current.CancellationToken);

        Assert.Equal(2, platform.Attempts);
        Assert.Equal(1, platform.Delivered);
    }

    [Fact]
    public async Task A_failed_attach_reported_by_the_host_also_cools_down()
    {
        var clock = new FakeTimeProvider();
        var platform = new FlakyNotifier();
        using var notifier = new DesktopReminderNotifier(clock);
        notifier.Use(platform);

        notifier.ReportFailure(new InvalidOperationException("No notification area."));
        await notifier.NotifyAsync(Notification, TestContext.Current.CancellationToken);
        clock.Advance(DesktopReminderNotifier.RetryDelay);
        await notifier.NotifyAsync(Notification, TestContext.Current.CancellationToken);

        Assert.Equal(1, platform.Attempts);
    }

    private sealed class FlakyNotifier : IReminderNotifier
    {
        public int FailuresLeft { get; set; }

        public int Attempts { get; private set; }

        public int Delivered { get; private set; }

        public Task NotifyAsync(ReminderNotification notification, CancellationToken cancellationToken)
        {
            Attempts++;
            if (FailuresLeft > 0)
            {
                FailuresLeft--;
                throw new InvalidOperationException("The notification service is unavailable.");
            }

            Delivered++;
            return Task.CompletedTask;
        }
    }
}