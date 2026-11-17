using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Items;
using TaskTracker.Core.Reminders;
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

        public Task NotifyAsync(ReminderNotification notification, CancellationToken cancellationToken)
        {
            Notifications.Add(notification);
            return Task.CompletedTask;
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