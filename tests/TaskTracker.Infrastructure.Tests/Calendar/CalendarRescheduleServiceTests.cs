using Microsoft.EntityFrameworkCore;

using TaskTracker.Core;
using TaskTracker.Core.Calendar;
using TaskTracker.Core.Items;
using TaskTracker.Infrastructure.Persistence;
using TaskTracker.Infrastructure.Tests.Persistence;

namespace TaskTracker.Infrastructure.Tests.Calendar;

/// <summary>Moving due dates and schedules from the calendar, against real SQLite.</summary>
public sealed class CalendarRescheduleServiceTests
{
    private static readonly DateOnly TheThirteenth = new(2026, 11, 13);

    [Fact]
    public async Task Moving_an_all_day_due_date_changes_only_the_date()
    {
        await using var fixture = await Fixture.CreateAsync();
        var item = await fixture.CreateItemAsync(due: TheThirteenth);

        await fixture.Service.MoveDueAsync(item, TheThirteenth.AddDays(3), null, TestContext.Current.CancellationToken);

        var stored = await fixture.ReadAsync(item);
        Assert.Equal(TheThirteenth.AddDays(3), stored.DueDate);
        Assert.Null(stored.DueTime);
    }

    [Fact]
    public async Task Moving_a_due_date_with_a_time_sets_both()
    {
        await using var fixture = await Fixture.CreateAsync();
        var item = await fixture.CreateItemAsync(due: TheThirteenth);

        await fixture.Service.MoveDueAsync(item, TheThirteenth.AddDays(1), new TimeOnly(14, 15),
            TestContext.Current.CancellationToken);

        var stored = await fixture.ReadAsync(item);
        Assert.Equal(TheThirteenth.AddDays(1), stored.DueDate);
        Assert.Equal(new TimeOnly(14, 15), stored.DueTime);
    }

    [Fact]
    public async Task Moving_a_due_date_without_a_time_clears_the_old_time()
    {
        await using var fixture = await Fixture.CreateAsync();
        var item = await fixture.CreateItemAsync(due: TheThirteenth, dueTime: new TimeOnly(9, 0));

        await fixture.Service.MoveDueAsync(item, TheThirteenth, null, TestContext.Current.CancellationToken);

        var stored = await fixture.ReadAsync(item);
        Assert.Equal(TheThirteenth, stored.DueDate);
        Assert.Null(stored.DueTime);
    }

    [Fact]
    public async Task Moving_a_due_date_updates_the_modified_time_and_leaves_the_schedule_alone()
    {
        await using var fixture = await Fixture.CreateAsync();
        var start = new DateTime(2026, 11, 13, 9, 0, 0);
        var item = await fixture.CreateItemAsync(due: TheThirteenth, start: start, end: start.AddHours(1));
        fixture.Store.Clock.Advance(TimeSpan.FromHours(2));

        await fixture.Service.MoveDueAsync(item, TheThirteenth.AddDays(2), null, TestContext.Current.CancellationToken);

        var stored = await fixture.ReadAsync(item);
        Assert.Equal(fixture.Store.Clock.GetUtcNow().UtcDateTime, stored.UpdatedAtUtc);
        Assert.Equal(start, stored.ScheduledStart);
        Assert.Equal(start.AddHours(1), stored.ScheduledEnd);
    }

    [Fact]
    public async Task Moving_a_schedule_keeps_its_length()
    {
        await using var fixture = await Fixture.CreateAsync();
        var start = new DateTime(2026, 11, 13, 9, 0, 0);
        var item = await fixture.CreateItemAsync(start: start, end: start.AddMinutes(90));
        var newStart = new DateTime(2026, 11, 15, 14, 30, 0);

        await fixture.Service.MoveScheduleAsync(item, newStart, TestContext.Current.CancellationToken);

        var stored = await fixture.ReadAsync(item);
        Assert.Equal(newStart, stored.ScheduledStart);
        Assert.Equal(newStart.AddMinutes(90), stored.ScheduledEnd);
    }

    [Fact]
    public async Task Moving_a_schedule_without_an_end_leaves_it_without_an_end()
    {
        await using var fixture = await Fixture.CreateAsync();
        var item = await fixture.CreateItemAsync(start: new DateTime(2026, 11, 13, 9, 0, 0));

        await fixture.Service.MoveScheduleAsync(item, new DateTime(2026, 11, 14, 9, 0, 0),
            TestContext.Current.CancellationToken);

        var stored = await fixture.ReadAsync(item);
        Assert.Equal(new DateTime(2026, 11, 14, 9, 0, 0), stored.ScheduledStart);
        Assert.Null(stored.ScheduledEnd);
    }

    [Fact]
    public async Task Moving_a_schedule_so_it_crosses_midnight_moves_the_end_the_same_distance()
    {
        await using var fixture = await Fixture.CreateAsync();
        var start = new DateTime(2026, 11, 13, 9, 0, 0);
        var item = await fixture.CreateItemAsync(start: start, end: start.AddHours(2));
        var newStart = new DateTime(2026, 11, 13, 23, 0, 0);

        await fixture.Service.MoveScheduleAsync(item, newStart, TestContext.Current.CancellationToken);

        var stored = await fixture.ReadAsync(item);
        Assert.Equal(newStart, stored.ScheduledStart);
        Assert.Equal(new DateTime(2026, 11, 14, 1, 0, 0), stored.ScheduledEnd);
    }

    [Fact]
    public async Task Moving_a_zero_length_schedule_keeps_it_zero_length()
    {
        await using var fixture = await Fixture.CreateAsync();
        var start = new DateTime(2026, 11, 13, 9, 0, 0);
        var item = await fixture.CreateItemAsync(start: start, end: start);

        await fixture.Service.MoveScheduleAsync(item, start.AddDays(1), TestContext.Current.CancellationToken);

        var stored = await fixture.ReadAsync(item);
        Assert.Equal(start.AddDays(1), stored.ScheduledStart);
        Assert.Equal(start.AddDays(1), stored.ScheduledEnd);
    }

    [Fact]
    public async Task Moving_a_deleted_item_fails_and_changes_nothing()
    {
        await using var fixture = await Fixture.CreateAsync();
        var start = new DateTime(2026, 11, 13, 9, 0, 0);
        var item = await fixture.CreateItemAsync(due: TheThirteenth, start: start);
        await fixture.DeleteAsync(item);

        var dueFailure = await Assert.ThrowsAsync<DomainRuleException>(() =>
            fixture.Service.MoveDueAsync(item, TheThirteenth.AddDays(1), null, TestContext.Current.CancellationToken));
        var scheduleFailure = await Assert.ThrowsAsync<DomainRuleException>(() =>
            fixture.Service.MoveScheduleAsync(item, start.AddDays(1), TestContext.Current.CancellationToken));

        Assert.Equal("Item is missing or deleted.", dueFailure.Message);
        Assert.Equal("Item is missing or deleted.", scheduleFailure.Message);
        var stored = await fixture.ReadIncludingDeletedAsync(item);
        Assert.Equal(TheThirteenth, stored.DueDate);
        Assert.Equal(start, stored.ScheduledStart);
    }

    [Fact]
    public async Task Moving_an_unknown_item_fails()
    {
        await using var fixture = await Fixture.CreateAsync();

        await Assert.ThrowsAsync<DomainRuleException>(() =>
            fixture.Service.MoveDueAsync(Guid.NewGuid(), TheThirteenth, null, TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Moving_the_schedule_of_an_item_without_one_fails_and_changes_nothing()
    {
        await using var fixture = await Fixture.CreateAsync();
        var item = await fixture.CreateItemAsync(due: TheThirteenth);

        await Assert.ThrowsAsync<DomainRuleException>(() => fixture.Service.MoveScheduleAsync(
            item, new DateTime(2026, 11, 14, 9, 0, 0), TestContext.Current.CancellationToken));

        var stored = await fixture.ReadAsync(item);
        Assert.Null(stored.ScheduledStart);
        Assert.Null(stored.ScheduledEnd);
    }

    [Fact]
    public async Task Moving_a_schedule_to_a_UTC_time_is_rejected()
    {
        await using var fixture = await Fixture.CreateAsync();
        var start = new DateTime(2026, 11, 13, 9, 0, 0);
        var item = await fixture.CreateItemAsync(start: start);

        await Assert.ThrowsAsync<DomainRuleException>(() => fixture.Service.MoveScheduleAsync(
            item, new DateTime(2026, 11, 14, 9, 0, 0, DateTimeKind.Utc), TestContext.Current.CancellationToken));

        Assert.Equal(start, (await fixture.ReadAsync(item)).ScheduledStart);
    }

    [Fact]
    public async Task Moving_a_schedule_past_the_last_supported_date_is_rejected()
    {
        await using var fixture = await Fixture.CreateAsync();
        var start = new DateTime(2026, 11, 13, 9, 0, 0);
        var item = await fixture.CreateItemAsync(start: start, end: start.AddHours(2));

        await Assert.ThrowsAsync<DomainRuleException>(() => fixture.Service.MoveScheduleAsync(
            item, DateTime.MaxValue.AddMinutes(-30), TestContext.Current.CancellationToken));

        Assert.Equal(start, (await fixture.ReadAsync(item)).ScheduledStart);
    }

    [Fact]
    public async Task Moving_a_completed_item_is_allowed()
    {
        await using var fixture = await Fixture.CreateAsync();
        var item = await fixture.CreateItemAsync(due: TheThirteenth);
        await fixture.CompleteAsync(item);

        await fixture.Service.MoveDueAsync(item, TheThirteenth.AddDays(1), null, TestContext.Current.CancellationToken);

        var stored = await fixture.ReadAsync(item);
        Assert.Equal(TheThirteenth.AddDays(1), stored.DueDate);
        Assert.NotNull(stored.CompletedAtUtc);
    }

    /// <summary>One test database with an item service for setup and the service under test.</summary>
    private sealed class Fixture : IAsyncDisposable
    {
        private readonly TaskTrackerDbContext setupContext;
        private readonly ItemService items;
        private readonly Guid projectId;

        private Fixture(SqliteTestStore store, TaskTrackerDbContext setupContext, ItemService items,
            Guid projectId, CalendarRescheduleService service)
        {
            Store = store;
            this.setupContext = setupContext;
            this.items = items;
            this.projectId = projectId;
            Service = service;
        }

        public SqliteTestStore Store { get; }

        public CalendarRescheduleService Service { get; }

        public static async Task<Fixture> CreateAsync()
        {
            var store = new SqliteTestStore();
            await store.InitializeAsync();
            var context = store.Open();
            var project = await store.Projects(context).CreateAsync("Project");
            var service = new CalendarRescheduleService(new TestUnitOfWorkFactory(context), store.Clock);
            return new Fixture(store, context, store.Items(context), project.Id, service);
        }

        public async Task<Guid> CreateItemAsync(DateOnly? due = null, TimeOnly? dueTime = null,
            DateTime? start = null, DateTime? end = null)
        {
            var item = await items.CreateAsync(projectId, null, null, "Item");
            var edit = new ItemEdit(item.Title, null, null, null, null, due, dueTime, start, end);
            await items.EditAsync(item.Id, edit);
            return item.Id;
        }

        public Task DeleteAsync(Guid itemId)
        {
            return items.DeleteAsync(projectId, null, itemId);
        }

        public Task CompleteAsync(Guid itemId)
        {
            return items.SetCompletedAsync(projectId, null, itemId, true);
        }

        public async Task<TodoItem> ReadAsync(Guid itemId)
        {
            await using var reader = Store.Open();
            return await reader.TodoItems.SingleAsync(row => row.Id == itemId);
        }

        public async Task<TodoItem> ReadIncludingDeletedAsync(Guid itemId)
        {
            await using var reader = Store.Open();
            return await reader.TodoItems.IgnoreQueryFilters().SingleAsync(row => row.Id == itemId);
        }

        public async ValueTask DisposeAsync()
        {
            await setupContext.DisposeAsync();
            await Store.DisposeAsync();
        }
    }
}