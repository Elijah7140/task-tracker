#pragma warning disable xUnit1051
using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Items;
using TaskTracker.Core.Today;
using TaskTracker.Infrastructure.Persistence;
using TaskTracker.Infrastructure.Tests.Persistence;

namespace TaskTracker.Infrastructure.Tests.Today;

/// <summary>Exercises local-day selection and ancestor projection against SQLite.</summary>
public sealed class TodayServiceTests
{
    [Theory]
    [InlineData(3, 8, 5, 4)]
    [InlineData(11, 1, 4, 5)]
    public async Task Local_day_includes_its_start_and_excludes_its_end_on_dst_days(
        int month, int day, int startHourUtc, int endHourUtc)
    {
        await using var store = new SqliteTestStore();
        var clock = new FakeTimeProvider(
            new DateTimeOffset(2026, month, day, 12, 0, 0, TimeSpan.Zero));
        await store.InitializeAsync();
        await using var database = store.Open();
        var project = await store.Projects(database).CreateAsync("Project");
        var start = new DateTime(2026, month, day, startHourUtc, 0, 0, DateTimeKind.Utc);
        var end = start.AddDays(1).Date.AddHours(endHourUtc);
        AddCompleted(database, store, project.Id, null, "Before", start.AddTicks(-1));
        AddCompleted(database, store, project.Id, null, "First", start);
        AddCompleted(database, store, project.Id, null, "Last", end.AddTicks(-1));
        AddCompleted(database, store, project.Id, null, "After", end);
        await database.SaveChangesAsync();
        var zone = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");
        var service = new TodayService(new TestUnitOfWorkFactory(database), clock, zone);

        var rows = await service.LoadAsync();

        Assert.Equal(["First", "Last"], rows.Select(row => row.Title).Order());
        Assert.Equal(new DateTimeOffset(end), service.NextMidnight);
    }

    [Fact]
    public async Task Only_current_completions_and_their_ancestors_in_active_areas_are_returned()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var project = await store.Projects(database).CreateAsync("Billing");
        var folder = await store.Folders(database).CreateAsync(project.Id, null, "dbo");
        var nested = await store.Folders(database).CreateAsync(project.Id, folder.Id, "Views");
        var items = store.Items(database);
        var ancestor = await items.CreateAsync(project.Id, nested.Id, null, "Ancestor");
        var parent = await items.CreateAsync(project.Id, nested.Id, ancestor.Id, "Parent");
        var service = new TodayService(new TestUnitOfWorkFactory(database), store.Clock, TimeZoneInfo.Utc);
        var child = await SeedCompletionsAsync(store, project.Id, nested.Id, parent.Id);
        await SeedDeletedLocationsAsync(store);

        var rows = (await service.LoadAsync()).ToDictionary(row => row.Id);

        Assert.Equal(3, rows.Count);
        Assert.False(rows[ancestor.Id].IsCompleted);
        Assert.Equal(ancestor.Id, rows[parent.Id].ParentItemId);
        Assert.Equal(parent.Id, rows[child.Id].ParentItemId);
        Assert.True(rows[child.Id].CompletedToday);
        Assert.All(rows.Values, row => Assert.Equal("Billing › dbo › Views", row.AreaPath));
    }

    private static async Task<TodoItem> SeedCompletionsAsync(SqliteTestStore store, Guid projectId, Guid folderId,
        Guid parentId)
    {
        await using var database = store.Open();
        var items = store.Items(database);
        var child = await items.CreateAsync(projectId, folderId, parentId, "Today");
        var reopened = await items.CreateAsync(projectId, folderId, parentId, "Reopened");
        var now = store.Clock.GetUtcNow().UtcDateTime;
        AddCompleted(database, store, projectId, folderId, "Yesterday", now.AddDays(-1), parentId);
        AddCompleted(database, store, projectId, folderId, "Deleted", now).Delete(Guid.NewGuid(), store.Clock);
        await database.SaveChangesAsync();
        await items.SetCompletedAsync(projectId, folderId, child.Id, true);
        await items.SetCompletedAsync(projectId, folderId, reopened.Id, true);
        await items.SetCompletedAsync(projectId, folderId, reopened.Id, false);
        return child;
    }

    private static async Task SeedDeletedLocationsAsync(SqliteTestStore store)
    {
        await using var database = store.Open();
        var projects = store.Projects(database);
        var deletedProject = await projects.CreateAsync("Deleted project");
        var liveProject = await projects.CreateAsync("Live project");
        var folder = await store.Folders(database).CreateAsync(liveProject.Id, null, "Deleted folder");
        var now = store.Clock.GetUtcNow().UtcDateTime;
        AddCompleted(database, store, deletedProject.Id, null, "Item in deleted project", now);
        AddCompleted(database, store, liveProject.Id, folder.Id, "Item in deleted folder", now);
        // Stamp only the containers to exercise the query's own active-location filters.
        database.Attach(deletedProject).Entity.Delete(Guid.NewGuid(), store.Clock);
        database.Attach(folder).Entity.Delete(Guid.NewGuid(), store.Clock);
        await database.SaveChangesAsync();
    }

    private static TodoItem AddCompleted(TaskTrackerDbContext database,
        SqliteTestStore store, Guid projectId, Guid? folderId, string title, DateTime instant, Guid? parentId = null)
    {
        var item = TodoItem.Create(projectId, folderId, parentId, title, store.Clock);
        item.SetCompletion(instant, store.Clock);
        database.TodoItems.Add(item);
        return item;
    }
}