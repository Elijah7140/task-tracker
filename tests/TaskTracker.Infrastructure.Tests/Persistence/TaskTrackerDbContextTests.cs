using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
using TaskTracker.Infrastructure.Persistence;

namespace TaskTracker.Infrastructure.Tests.Persistence;

public sealed class TaskTrackerDbContextTests
{
    [Fact]
    public async Task Migration_seeds_built_in_lookups()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(TestContext.Current.CancellationToken);
        await using var database = CreateDatabase(connection);

        await database.Database.MigrateAsync(TestContext.Current.CancellationToken);

        Assert.Equal(3, await database.ItemTypes.CountAsync(TestContext.Current.CancellationToken));
        Assert.Equal(4, await database.PriorityLevels.CountAsync(TestContext.Current.CancellationToken));
        Assert.Contains(await database.ItemTypes.ToListAsync(TestContext.Current.CancellationToken), row => row.Id == BuiltInLookups.ChangeId);
    }

    [Fact]
    public async Task Query_filter_hides_soft_deleted_projects()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(TestContext.Current.CancellationToken);
        await using var database = CreateDatabase(connection);
        await database.Database.MigrateAsync(TestContext.Current.CancellationToken);
        var project = Project.Create("One", TimeProvider.System);
        database.Projects.Add(project);
        await database.SaveChangesAsync(TestContext.Current.CancellationToken);

        project.Delete(Guid.CreateVersion7(), TimeProvider.System);
        await database.SaveChangesAsync(TestContext.Current.CancellationToken);

        Assert.Empty(await database.Projects.ToListAsync(TestContext.Current.CancellationToken));
        Assert.Single(await database.Projects.IgnoreQueryFilters().ToListAsync(TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Dates_and_times_round_trip_as_sqlite_text()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        await using var database = CreateDatabase(connection);
        await database.Database.MigrateAsync(cancellationToken);
        var project = Project.Create("Project", TimeProvider.System);
        var item = TodoItem.Create(project.Id, null, null, "Meeting", TimeProvider.System);
        item.SetDue(new DateOnly(2026, 12, 1), new TimeOnly(15, 30), TimeProvider.System);
        item.SetSchedule(new DateTime(2026, 11, 30, 9, 0, 0),
            new DateTime(2026, 11, 30, 10, 0, 0), TimeProvider.System);
        database.Projects.Add(project);
        database.TodoItems.Add(item);
        await database.SaveChangesAsync(cancellationToken);

        await using var reader = CreateDatabase(connection);
        var restored = await reader.TodoItems.SingleAsync(cancellationToken);

        Assert.Equal(new DateOnly(2026, 12, 1), restored.DueDate);
        Assert.Equal(new TimeOnly(15, 30), restored.DueTime);
        Assert.Equal(new DateTime(2026, 11, 30, 9, 0, 0), restored.ScheduledStart);
        Assert.Equal(DateTimeKind.Utc, restored.CreatedAtUtc.Kind);
    }

    [Fact]
    public async Task Check_constraints_reject_invalid_due_and_schedule_rows()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        await using var database = CreateDatabase(connection);
        await database.Database.MigrateAsync(cancellationToken);
        var project = Project.Create("Project", TimeProvider.System);
        var item = TodoItem.Create(project.Id, null, null, "Task", TimeProvider.System);
        database.Projects.Add(project);
        database.TodoItems.Add(item);
        await database.SaveChangesAsync(cancellationToken);

        var exception = await Assert.ThrowsAsync<SqliteException>(() =>
            database.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE TodoItem SET DueTime = {"15:00:00"} WHERE Id = {item.Id}", cancellationToken));
        var scheduleException = await Assert.ThrowsAsync<SqliteException>(() =>
            database.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE TodoItem SET ScheduledEnd = {"2026-12-01 10:00:00"} WHERE Id = {item.Id}", cancellationToken));

        Assert.Equal(19, exception.SqliteErrorCode);
        Assert.Equal(19, scheduleException.SqliteErrorCode);
    }


    [Fact]
    public async Task Query_filters_hide_soft_deleted_folders_and_items()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var project = await store.Projects(writer).CreateAsync("Project", TestContext.Current.CancellationToken);
        var folder = await store.Folders(writer).CreateAsync(project.Id, null, "Folder", TestContext.Current.CancellationToken);
        await store.Items(writer).CreateAsync(project.Id, folder.Id, null, "Item", TestContext.Current.CancellationToken);

        await store.Folders(writer).DeleteAsync(project.Id, folder.Id, TestContext.Current.CancellationToken);
        await using var reader = store.Open();

        Assert.Empty(await reader.Folders.ToListAsync(TestContext.Current.CancellationToken));
        Assert.Empty(await reader.TodoItems.ToListAsync(TestContext.Current.CancellationToken));
        Assert.Single(await reader.Folders.IgnoreQueryFilters().ToListAsync(TestContext.Current.CancellationToken));
        Assert.Single(await reader.TodoItems.IgnoreQueryFilters().ToListAsync(TestContext.Current.CancellationToken));
    }
    private static TaskTrackerDbContext CreateDatabase(SqliteConnection connection)
    {
        var options = new DbContextOptionsBuilder<TaskTrackerDbContext>()
            .UseSqlite(connection)
            .Options;
        return new TaskTrackerDbContext(options);
    }
}