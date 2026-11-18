using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Calendar;
using TaskTracker.Core.Items;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Reminders;
using TaskTracker.Core.Search;
using TaskTracker.Core.Trash;
using TaskTracker.Presentation.Reminders;
using TaskTracker.Presentation.Tests.ViewModels;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.Reminders;

/// <summary>Exercises the reminder schedule against an injected clock and captured notifications.</summary>
public sealed class ReminderSchedulerTests
{
    [Fact]
    public async Task The_thirty_second_tick_delivers_a_due_reminder_once()
    {
        var clock = new FakeTimeProvider();
        await using var store = await CreateStoreAsync(clock);
        var now = clock.GetUtcNow().UtcDateTime;
        var item = await SaveAsync(store, "Minutes", now.AddSeconds(15));
        var notifier = new CaptureNotifier();
        var dispatcher = new QueuedDispatcher();
        using var scheduler = new ReminderScheduler(store.Reminders, store.Saves, clock, notifier, dispatcher);
        await scheduler.StartAsync();

        clock.Advance(TimeSpan.FromSeconds(29));
        dispatcher.Flush();
        Assert.Empty(notifier.Notifications);
        clock.Advance(TimeSpan.FromSeconds(1));
        dispatcher.Flush();

        Assert.Equal(item.Id, Assert.Single(notifier.Notifications).ItemId);
        clock.Advance(TimeSpan.FromSeconds(30));
        dispatcher.Flush();
        Assert.Single(notifier.Notifications);
    }

    [Fact]
    public async Task A_save_checks_immediately_and_catches_a_newly_due_item()
    {
        var clock = new FakeTimeProvider();
        await using var store = await CreateStoreAsync(clock);
        var notifier = new CaptureNotifier();
        var dispatcher = new QueuedDispatcher();
        using var scheduler = new ReminderScheduler(store.Reminders, store.Saves, clock, notifier, dispatcher);
        await scheduler.StartAsync();

        var item = await SaveAsync(store, "Due now", clock.GetUtcNow().UtcDateTime);
        dispatcher.Flush();

        Assert.Equal(item.Id, Assert.Single(notifier.Notifications).ItemId);
        Assert.Empty(await store.Reminders.DueAsync(TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task A_wall_clock_jump_triggers_a_check_before_the_next_thirty_second_tick()
    {
        var clock = new FakeTimeProvider();
        await using var store = await CreateStoreAsync(clock);
        var item = await SaveAsync(store, "Clock change", clock.GetUtcNow().UtcDateTime.AddMinutes(1));
        var notifier = new CaptureNotifier();
        var dispatcher = new QueuedDispatcher();
        using var scheduler = new ReminderScheduler(store.Reminders, store.Saves, clock, notifier, dispatcher);
        await scheduler.StartAsync();

        clock.AdjustTime(clock.GetUtcNow().AddMinutes(2));
        clock.Advance(TimeSpan.FromSeconds(1));
        dispatcher.Flush();

        Assert.Equal(item.Id, Assert.Single(notifier.Notifications).ItemId);
    }

    [Fact]
    public async Task Startup_groups_the_last_twenty_four_hours_and_marks_older_reminders_delivered()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 11, 17, 12, 0, 0, TimeSpan.Zero));
        await using var store = await CreateStoreAsync(clock);
        var now = clock.GetUtcNow().UtcDateTime;
        await SaveAsync(store, "Old", now.AddHours(-24).AddTicks(-1));
        await SaveAsync(store, "Boundary", now.AddHours(-24));
        await SaveAsync(store, "Recent", now.AddMinutes(-1));
        var notifier = new CaptureNotifier();
        var dispatcher = new QueuedDispatcher();
        using var scheduler = new ReminderScheduler(store.Reminders, store.Saves, clock, notifier, dispatcher);
        var shown = new List<ReminderEntry>();
        scheduler.Delivered += shown.AddRange;

        await scheduler.StartAsync();

        Assert.Equal("2 reminders while you were away", Assert.Single(notifier.Notifications).Title);
        Assert.Null(notifier.Notifications[0].ItemId);
        Assert.Equal(["Recent", "Boundary"], shown.Select(entry => entry.Title));
        Assert.Empty(await store.Reminders.DueAsync(TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task A_live_check_groups_recent_reminders_and_records_older_ones_silently()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 11, 17, 12, 0, 0, TimeSpan.Zero));
        await using var store = await CreateStoreAsync(clock);
        var notifier = new CaptureNotifier();
        var dispatcher = new QueuedDispatcher();
        using var scheduler = new ReminderScheduler(store.Reminders, store.Saves, clock, notifier, dispatcher);
        var shown = new List<ReminderEntry>();
        scheduler.Delivered += shown.AddRange;
        await scheduler.StartAsync();
        var now = clock.GetUtcNow().UtcDateTime;

        for (var day = 2; day <= 6; day++)
        {
            await SaveAsync(store, $"Imported {day}", now.AddDays(-day));
        }

        await SaveAsync(store, "Recent", now.AddMinutes(-5));
        await SaveAsync(store, "Now", now);
        dispatcher.Flush();

        var notification = Assert.Single(notifier.Notifications);
        Assert.Equal("2 reminders due", notification.Title);
        Assert.Null(notification.ItemId);
        Assert.Equal(["Now", "Recent"], shown.Select(entry => entry.Title));
        Assert.Empty(await store.Reminders.DueAsync(TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task A_failed_startup_discard_still_notifies_only_recent_reminders()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 11, 17, 12, 0, 0, TimeSpan.Zero));
        await using var store = await CreateStoreAsync(clock);
        var now = clock.GetUtcNow().UtcDateTime;
        for (var day = 2; day <= 6; day++)
        {
            await SaveAsync(store, $"Old {day}", now.AddDays(-day));
        }

        await SaveAsync(store, "Recent", now.AddMinutes(-5));
        var units = new FailingSaveUnitOfWorkFactory(store.UnitOfWorkFactory) { FailuresLeft = 1 };
        var reminders = new ReminderService(units, clock, TimeZoneInfo.Utc, store.WriteGate);
        var notifier = new CaptureNotifier();
        var dispatcher = new QueuedDispatcher();
        using var scheduler = new ReminderScheduler(reminders, store.Saves, clock, notifier, dispatcher);

        await scheduler.StartAsync();
        clock.Advance(TimeSpan.FromSeconds(30));
        dispatcher.Flush();

        Assert.Equal("1 reminder while you were away", Assert.Single(notifier.Notifications).Title);
        Assert.Empty(await store.Reminders.DueAsync(TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Disposing_stops_delivery_of_a_queued_check()
    {
        var clock = new FakeTimeProvider();
        await using var store = await CreateStoreAsync(clock);
        var notifier = new CaptureNotifier();
        var dispatcher = new QueuedDispatcher();
        var scheduler = new ReminderScheduler(store.Reminders, store.Saves, clock, notifier, dispatcher);
        await scheduler.StartAsync();
        await SaveAsync(store, "Due now", clock.GetUtcNow().UtcDateTime);

        scheduler.Dispose();
        dispatcher.Flush();
        clock.Advance(TimeSpan.FromMinutes(1));
        dispatcher.Flush();

        Assert.Empty(notifier.Notifications);
        Assert.Single(await store.Reminders.DueAsync(TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task A_throwing_notifier_is_not_called_again_for_the_same_reminder()
    {
        var clock = new FakeTimeProvider();
        await using var store = await CreateStoreAsync(clock);
        var notifier = new CaptureNotifier { Throws = true };
        var dispatcher = new QueuedDispatcher();
        using var scheduler = new ReminderScheduler(store.Reminders, store.Saves, clock, notifier, dispatcher);
        var shown = new List<ReminderEntry>();
        scheduler.Delivered += shown.AddRange;
        await scheduler.StartAsync();

        var item = await SaveAsync(store, "Due now", clock.GetUtcNow().UtcDateTime);
        dispatcher.Flush();
        clock.Advance(TimeSpan.FromSeconds(30));
        dispatcher.Flush();

        Assert.Single(notifier.Notifications);
        Assert.Equal(item.Id, Assert.Single(shown).ItemId);
    }

    [Fact]
    public async Task A_restart_does_not_deliver_a_reminder_again()
    {
        var clock = new FakeTimeProvider();
        await using var store = await CreateStoreAsync(clock);
        await SaveAsync(store, "Due now", clock.GetUtcNow().UtcDateTime);
        var notifier = new CaptureNotifier();
        var dispatcher = new QueuedDispatcher();
        using (var first = new ReminderScheduler(store.Reminders, store.Saves, clock, notifier, dispatcher))
        {
            await first.StartAsync();
        }

        using var second = new ReminderScheduler(store.Reminders, store.Saves, clock, notifier, dispatcher);
        await second.StartAsync();
        clock.Advance(TimeSpan.FromSeconds(30));
        dispatcher.Flush();

        Assert.Single(notifier.Notifications);
    }

    [Fact]
    public async Task Overlapping_check_requests_deliver_once()
    {
        var clock = new FakeTimeProvider();
        await using var store = await CreateStoreAsync(clock);
        var notifier = new CaptureNotifier { Gate = new TaskCompletionSource() };
        var dispatcher = new QueuedDispatcher();
        using var scheduler = new ReminderScheduler(store.Reminders, store.Saves, clock, notifier, dispatcher);
        var refreshes = 0;
        scheduler.RefreshPanelAsync = () =>
        {
            Interlocked.Increment(ref refreshes);
            return Task.CompletedTask;
        };
        await scheduler.StartAsync();
        await SaveAsync(store, "Due now", clock.GetUtcNow().UtcDateTime);
        dispatcher.Flush();
        await notifier.Entered.Task.WaitAsync(TestContext.Current.CancellationToken);

        scheduler.RequestCheck();
        dispatcher.Flush();
        notifier.Gate.SetResult();
        await WaitUntilAsync(() => Volatile.Read(ref refreshes) == 3);

        Assert.Single(notifier.Notifications);
        Assert.Empty(await store.Reminders.DueAsync(TestContext.Current.CancellationToken));
    }

    private static async Task WaitUntilAsync(Func<bool> condition)
    {
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (!condition())
        {
            Assert.True(DateTime.UtcNow < deadline, "The condition was not met in time.");
            await Task.Delay(10, TestContext.Current.CancellationToken);
        }
    }

    private static async Task<PresentationTestStore> CreateStoreAsync(TimeProvider clock)
    {
        var store = new PresentationTestStore(clock);
        await store.InitializeAsync();
        return store;
    }

    internal static async Task<TodoItem> SaveAsync(PresentationTestStore store, string title, DateTime due)
    {
        var project = await store.Projects.CreateAsync(title + " Project");
        var item = await store.Items.CreateAsync(project.Id, null, null, title);
        var edit = new ItemEdit(title, null, null, null, null, DateOnly.FromDateTime(due), TimeOnly.FromDateTime(due), null, null)
        {
            UpdateReminder = true,
            ReminderMode = ReminderMode.Offset,
            ReminderOffsetMinutes = 0,
        };
        await store.Items.EditAsync(item.Id, edit);
        return item;
    }

    private sealed class CaptureNotifier : IReminderNotifier
    {
        public List<ReminderNotification> Notifications { get; } = [];

        public bool Throws { get; init; }

        /// <summary>When set, each notification waits for this gate after signalling <see cref="Entered"/>.</summary>
        public TaskCompletionSource? Gate { get; init; }

        public TaskCompletionSource Entered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public async Task NotifyAsync(ReminderNotification notification, CancellationToken cancellationToken)
        {
            Notifications.Add(notification);
            Entered.TrySetResult();
            if (Gate is not null)
            {
                await Gate.Task;
            }

            if (Throws)
            {
                throw new InvalidOperationException("The notification service is unavailable.");
            }
        }
    }

    /// <summary>Fails the next <see cref="FailuresLeft"/> saves, to simulate a database that briefly refuses writes.</summary>
    private sealed class FailingSaveUnitOfWorkFactory(IUnitOfWorkFactory inner) : IUnitOfWorkFactory
    {
        public int FailuresLeft { get; set; }

        public IUnitOfWork Begin()
        {
            return new FailingSaveUnitOfWork(inner.Begin(), this);
        }

        public bool TakeFailure()
        {
            if (FailuresLeft == 0)
            {
                return false;
            }

            FailuresLeft--;
            return true;
        }
    }

    private sealed class FailingSaveUnitOfWork(IUnitOfWork inner, FailingSaveUnitOfWorkFactory owner) : IUnitOfWork
    {
        public IProjectRepository Projects => inner.Projects;

        public IFolderRepository Folders => inner.Folders;

        public IItemRepository Items => inner.Items;

        public ILookupRepository Lookups => inner.Lookups;

        public IFieldRepository Fields => inner.Fields;

        public ISettingsStore Settings => inner.Settings;

        public IItemSearch Search => inner.Search;

        public ICalendarRepository Calendar => inner.Calendar;

        public ITrashRepository Trash => inner.Trash;

        public ISavedSearchRepository SavedSearches => inner.SavedSearches;

        public IReminderRepository Reminders => inner.Reminders;

        public Task SaveChangesAsync(CancellationToken cancellationToken)
        {
            if (owner.TakeFailure())
            {
                throw new InvalidOperationException("The database refused the write.");
            }

            return inner.SaveChangesAsync(cancellationToken);
        }

        public Task SaveChangesAsync(string undoLabel, CancellationToken cancellationToken)
        {
            return inner.SaveChangesAsync(undoLabel, cancellationToken);
        }

        public ValueTask DisposeAsync()
        {
            return inner.DisposeAsync();
        }
    }

    private sealed class QueuedDispatcher : IUiDispatcher
    {
        private readonly Queue<Action> actions = new();

        public void Post(Action action)
        {
            actions.Enqueue(action);
        }

        public void Flush()
        {
            while (actions.TryDequeue(out var action))
            {
                action();
            }
        }
    }
}