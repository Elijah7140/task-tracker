using System.Diagnostics;

using TaskTracker.Core.Persistence;
using TaskTracker.Core.Reminders;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Reminders;

/// <summary>Runs sequential reminder checks on the UI owner and handles the startup catch-up.</summary>
public sealed class ReminderScheduler(ReminderService service, DataSaved saves, TimeProvider clock,
    IReminderNotifier notifier, IUiDispatcher dispatcher) : IDisposable
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan ClockJump = TimeSpan.FromMilliseconds(250);

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
        var now = clock.GetUtcNow();
        lastWallTime = now;
        lastCheck = lastTick = clock.GetTimestamp();
        saves.Committed += RequestCheck;
        var pulse = TimeSpan.FromSeconds(1);
        timer = clock.CreateTimer(_ => OnTick(), null, pulse, pulse);
        await CheckAsync(now.UtcDateTime);
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
        await CheckAsync();
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

    private async Task CheckAsync(DateTime? startup = null)
    {
        await checkGate.WaitAsync();
        try
        {
            if (startup is DateTime now)
            {
                await CatchUpAsync(now);
            }

            await DeliverLiveAsync();
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

    private async Task CatchUpAsync(DateTime now)
    {
        var cutoff = new DateTime(Math.Max(0, now.Ticks - TimeSpan.TicksPerDay), DateTimeKind.Utc);
        await DiscardOlderAsync(now, cutoff);
        var recent = await ReadRecentAsync(now, cutoff);
        if (recent.Count == 0 || disposed)
        {
            return;
        }

        var summary = recent.Count == 1 ? "1 reminder while you were away" : $"{recent.Count} reminders while you were away";
        await NotifyAsync(new ReminderNotification(summary, "Open Task Tracker to see your reminders.", null), recent);
        await RecordAndPublishAsync(recent);
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

    private async Task DeliverLiveAsync()
    {
        while (!disposed)
        {
            var batch = await service.DueAsync();
            if (batch.Count == 0)
            {
                return;
            }

            foreach (var entry in batch)
            {
                await NotifyAsync(new ReminderNotification(entry.Title, entry.ProjectName, entry.ItemId), [entry]);
            }

            await RecordAndPublishAsync(batch);
        }
    }

    private async Task NotifyAsync(ReminderNotification notification, IReadOnlyList<ReminderEntry> entries)
    {
        if (!disposed && entries.Any(entry => !pendingDelivery.Contains(DeliveryKey(entry))))
        {
            await notifier.NotifyAsync(notification, CancellationToken.None);
            pendingDelivery.UnionWith(entries.Select(DeliveryKey));
        }
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