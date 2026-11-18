#pragma warning disable xUnit1051
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Search;
using TaskTracker.Infrastructure.Persistence;

namespace TaskTracker.Infrastructure.Tests.Persistence;

public sealed class StatusMigrationTests
{
    [Fact]
    public async Task Upgrade_backfills_completion_rewrites_saved_searches_and_keeps_full_text_live()
    {
        const string previousMigration = "20261118033043_IndexTodayCompletions";
        const string stamp = "2026-11-13 12:00:00";
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = TaskTrackerSqliteOptions.Configure(new DbContextOptionsBuilder<TaskTrackerDbContext>(), connection).Options;
        var projectId = Guid.CreateVersion7();
        var itemId = Guid.CreateVersion7();
        var fieldId = Guid.CreateVersion7();
        await using (var old = new TaskTrackerDbContext(options))
        {
            await old.GetService<IMigrator>().MigrateAsync(previousMigration);
            await old.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO Project (Id, Name, SortOrder, CreatedAtUtc, UpdatedAtUtc)
                    VALUES ({projectId}, 'Project', 0, {stamp}, {stamp});
                INSERT INTO TodoItem (Id, ProjectId, Title, SortOrder, CreatedAtUtc, UpdatedAtUtc, CompletedAtUtc)
                    VALUES ({itemId}, {projectId}, 'Release notes', 0, {stamp}, {stamp}, {stamp});
                INSERT INTO FieldDefinition (Id, Key, DisplayName, DataType, IsArchived, SortOrder)
                    VALUES ({fieldId}, 'completed', 'Completed notes', 'Text', 0, 0);
                INSERT INTO SavedSearch (Id, Name, QueryText, ScopeKind, IncludeSubfolders, IncludeCompleted, SortOrder, CreatedAtUtc, UpdatedAtUtc)
                    VALUES ({Guid.CreateVersion7()}, 'Done', 'STATUS:true has:completed "status:false"', 'AllProjects', 0, 1, 0, {stamp}, {stamp});
                """);
        }

        await using var updated = new TaskTrackerDbContext(options);
        await updated.Database.MigrateAsync();

        Assert.Equal("completed:true has:completed-2 \"status:false\"", (await updated.SavedSearches.SingleAsync()).QueryText);
        Assert.Equal("completed-2", (await updated.FieldDefinitions.SingleAsync()).Key);
        var item = await updated.TodoItems.SingleAsync();
        Assert.Equal(BuiltInLookups.CompletedId, item.StatusId);
        Assert.Null(item.ReopenStatusId);
        await updated.Database.ExecuteSqlInterpolatedAsync($"UPDATE TodoItem SET Title = 'Current release' WHERE Id = {itemId}");
        var factory = new TestUnitOfWorkFactory(updated);
        var search = new ItemSearchService(factory, new ItemQueryValidator(factory));
        var query = new ItemQuery(new SearchScope.AllProjects(), "Current", [], true);
        Assert.Equal(itemId, Assert.Single((await search.SearchAsync(query)).Items).ItemId);
        Assert.Empty((await search.SearchAsync(query with { Text = "notes" })).Items);
    }

    [Fact]
    public async Task Downgrade_removes_statuses_and_restores_the_old_search_key()
    {
        const string previousMigration = "20261118033043_IndexTodayCompletions";
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = TaskTrackerSqliteOptions.Configure(new DbContextOptionsBuilder<TaskTrackerDbContext>(), connection).Options;
        await using var database = new TaskTrackerDbContext(options);
        await database.Database.MigrateAsync();
        var factory = new TestUnitOfWorkFactory(database);
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 11, 13, 12, 0, 0, TimeSpan.Zero));
        var items = new ItemService(factory, clock, TimeZoneInfo.Utc);
        var projects = new ProjectService(factory, clock, TimeZoneInfo.Utc);
        var project = await projects.CreateAsync("Project");
        var item = await items.CreateAsync(project.Id, null, null, "Shipped");
        await items.SetCompletedAsync(project.Id, null, item.Id, true);
        await database.Database.ExecuteSqlRawAsync("""
            INSERT INTO SavedSearch (Id, Name, QueryText, ScopeKind, IncludeSubfolders, IncludeCompleted, SortOrder, CreatedAtUtc, UpdatedAtUtc)
                VALUES ('019A0000-0000-7000-8000-0000000000AA', 'Done', 'completed:true', 'AllProjects', 0, 1, 0, '2026-11-13 12:00:00', '2026-11-13 12:00:00');
            """);

        await database.GetService<IMigrator>().MigrateAsync(previousMigration);

        Assert.Equal("status:true", await ScalarAsync(connection, "SELECT QueryText FROM SavedSearch"));
        Assert.Equal(0L, await ScalarAsync(connection, "SELECT COUNT(*) FROM sqlite_master WHERE name = 'StatusLevel'"));
        Assert.Equal(1L, await ScalarAsync(connection, "SELECT COUNT(*) FROM TodoItem WHERE CompletedAtUtc IS NOT NULL"));
    }

    private static async Task<object?> ScalarAsync(SqliteConnection connection, string sql)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        return await command.ExecuteScalarAsync();
    }
}