using System.Diagnostics;

using TaskTracker.Core.Persistence;
using TaskTracker.Core.Reminders;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Reminders;

/// <summary>
/// Runs sequential reminder checks on the UI owner. Each check notifies only reminders from the
/// last 24 hours, grouping several into one notification, and records older ones silently.
/// </summary>
public sealed class ReminderScheduler(ReminderService service, DataSaved saves, TimeProvider clock,
    IReminderNotifier notifier, IUiDispatcher dispatcher) : IDisposable
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan ClockJump = TimeSpan.FromMilliseconds(250);
    private const string GroupedBody = "Open Task Tracker to see your reminders.";

    private readonly Lock tickGate = new();
    private readonly HashSet<(Guid ItemId, long InstantTicks)> pendingDelivery = [];
    private readonly SemaphoreSlim checkGate = new(1);
    private ITimer? timer;
    private long lastCheck;
    private long lastTick;
    private DateTimeOffset lastWallTime;
    private int checkQueued;
    private volatile bool started;
    private volatile bool disposed;

    public event Action<IReadOnlyList<ReminderEntry>>? Delivered;

    public Func<Task>? RefreshPanelAsync { private get; set; }

    public async Task StartAsync()
    {
        if (started || disposed)
        {
            return;
        }

        started = true;
        lastWallTime = clock.GetUtcNow();
        lastCheck = lastTick = clock.GetTimestamp();
        saves.Committed += RequestCheck;
        var pulse = TimeSpan.FromSeconds(1);
        timer = clock.CreateTimer(_ => OnTick(), null, pulse, pulse);
        await CheckAsync(startup: true);
    }

    /// <summary>Schedules a check on a save, resume, or clock change.</summary>
    public void RequestCheck()
    {
        if (started && !disposed && Interlocked.Exchange(ref checkQueued, 1) == 0)
        {
            dispatcher.Post(RunRequestedCheck);
        }
    }

    private async void RunRequestedCheck()
    {
        Interlocked.Exchange(ref checkQueued, 0);
        await CheckAsync(startup: false);
    }

    private void OnTick()
    {
        lock (tickGate)
        {
            var timestamp = clock.GetTimestamp();
            var now = clock.GetUtcNow();
            var elapsed = clock.GetElapsedTime(lastTick, timestamp);
            var wallChange = now - lastWallTime;
            lastTick = timestamp;
            lastWallTime = now;
            if (clock.GetElapsedTime(lastCheck, timestamp) < Interval
                && (wallChange - elapsed).Duration() < ClockJump)
            {
                return;
            }

            lastCheck = timestamp;
        }

        RequestCheck();
    }

    private async Task CheckAsync(bool startup)
    {
        await checkGate.WaitAsync();
        try
        {
            if (disposed)
            {
                return;
            }

            await DeliverDueAsync(clock.GetUtcNow().UtcDateTime, startup);
            if (!disposed && RefreshPanelAsync is { } refresh)
            {
                await refresh();
            }
        }
        catch (Exception exception)
        {
            Trace.TraceError($"Reminder check failed: {exception}");
        }
        finally
        {
            checkGate.Release();
        }
    }

    /// <summary>
    /// Discards reminders older than 24 hours, then notifies the recent ones. The recent read is
    /// bounded by the window itself, so a failed discard can never turn into a flood.
    /// </summary>
    private async Task DeliverDueAsync(DateTime now, bool startup)
    {
        var cutoff = new DateTime(Math.Max(0, now.Ticks - TimeSpan.TicksPerDay), DateTimeKind.Utc);
        await TryDiscardOlderAsync(now, cutoff);
        var recent = await ReadRecentAsync(now, cutoff);
        if (recent.Count == 0 || disposed)
        {
            return;
        }

        await NotifyAsync(BuildNotification(recent, startup), recent);
        await RecordAndPublishAsync(recent);
    }

    /// <summary>One reminder found by a live check names its item; anything else is one grouped notification.</summary>
    private static ReminderNotification BuildNotification(IReadOnlyList<ReminderEntry> entries, bool startup)
    {
        if (!startup && entries.Count == 1)
        {
            var entry = entries[0];
            return new ReminderNotification(entry.Title, entry.ProjectName, entry.ItemId);
        }

        var count = entries.Count == 1 ? "1 reminder" : $"{entries.Count} reminders";
        var title = startup ? $"{count} while you were away" : $"{count} due";
        return new ReminderNotification(title, GroupedBody, null);
    }

    private async Task TryDiscardOlderAsync(DateTime now, DateTime cutoff)
    {
        try
        {
            await DiscardOlderAsync(now, cutoff);
        }
        catch (Exception exception)
        {
            Trace.TraceWarning($"Old reminders were not discarded; the next check retries: {exception.Message}");
        }
    }

    private async Task DiscardOlderAsync(DateTime now, DateTime cutoff)
    {
        while (!disposed)
        {
            var batch = await service.DueAsync(now, cutoff);
            if (batch.Count == 0)
            {
                return;
            }

            await service.RecordDeliveryAsync(batch);
        }
    }

    private async Task<List<ReminderEntry>> ReadRecentAsync(DateTime now, DateTime cutoff)
    {
        var recent = new List<ReminderEntry>();
        while (!disposed)
        {
            var batch = await service.DueAsync(now, before: null, skip: recent.Count, since: cutoff);
            if (batch.Count == 0)
            {
                break;
            }

            recent.AddRange(batch);
        }

        return recent;
    }

    /// <summary>
    /// Notifies at most once per reminder. A notifier failure is logged and the reminder is still
    /// recorded, because the in-app panel shows it regardless.
    /// </summary>
    private async Task NotifyAsync(ReminderNotification notification, IReadOnlyList<ReminderEntry> entries)
    {
        if (disposed || entries.All(entry => pendingDelivery.Contains(DeliveryKey(entry))))
        {
            return;
        }

        try
        {
            await notifier.NotifyAsync(notification, CancellationToken.None);
        }
        catch (Exception exception)
        {
            Trace.TraceWarning($"Reminder notification failed: {exception.Message}");
        }

        pendingDelivery.UnionWith(entries.Select(DeliveryKey));
    }

    private async Task RecordAndPublishAsync(IReadOnlyList<ReminderEntry> entries)
    {
        if (disposed)
        {
            return;
        }

        await service.RecordDeliveryAsync(entries);
        pendingDelivery.ExceptWith(entries.Select(DeliveryKey));
        Delivered?.Invoke(entries);
    }

    private static (Guid ItemId, long InstantTicks) DeliveryKey(ReminderEntry entry)
    {
        return (entry.ItemId, entry.InstantTicks);
    }

    public void Dispose()
    {
        disposed = true;
        saves.Committed -= RequestCheck;
        timer?.Dispose();
    }
}