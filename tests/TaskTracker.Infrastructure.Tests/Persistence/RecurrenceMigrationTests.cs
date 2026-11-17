#pragma warning disable xUnit1051
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

using TaskTracker.Infrastructure.Persistence;

namespace TaskTracker.Infrastructure.Tests.Persistence;

/// <summary>Upgrade and rollback of a populated database with a trigger-maintained search index.</summary>
public sealed class RecurrenceMigrationTests
{
    private const string PreviousMigration = "20261115121847_AddItemLinks";

    [Fact]
    public async Task Adding_and_dropping_recurrence_columns_preserves_fts_and_its_triggers()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<TaskTrackerDbContext>().UseSqlite(connection).Options;
        await using var database = new TaskTrackerDbContext(options);
        var migrator = database.GetService<IMigrator>();
        await migrator.MigrateAsync(PreviousMigration);
        await SeedAsync(database);

        await migrator.MigrateAsync();

        var existing = await database.TodoItems.AsNoTracking().SingleAsync();
        Assert.Null(existing.Recurrence);
        Assert.False(existing.RecurrenceSuccessorCreated);
        await AssertSearchIsMaintainedAsync(database, "upgraded");

        await migrator.MigrateAsync(PreviousMigration);

        await AssertSearchIsMaintainedAsync(database, "downgraded");
    }

    private static async Task SeedAsync(TaskTrackerDbContext database)
    {
        await database.Database.ExecuteSqlRawAsync("""
            INSERT INTO Project (Id, Name, SortOrder, CreatedAtUtc, UpdatedAtUtc)
            VALUES ('00000000-0000-0000-0000-000000000001', 'Project', 0, '2026-11-13', '2026-11-13')
            """);
        await database.Database.ExecuteSqlRawAsync("""
            INSERT INTO TodoItem (Id, ProjectId, Title, SortOrder, CreatedAtUtc, UpdatedAtUtc)
            VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
                'existing', 0, '2026-11-13', '2026-11-13')
            """);
    }

    private static async Task AssertSearchIsMaintainedAsync(TaskTrackerDbContext database, string title)
    {
        var triggers = await database.Database.SqlQueryRaw<string>(
            "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'TodoItemSearch%' ORDER BY name")
            .ToListAsync();
        Assert.Equal(["TodoItemSearchRow_Delete", "TodoItemSearch_Delete", "TodoItemSearch_Insert", "TodoItemSearch_Update"], triggers);
        Assert.Equal(1, await database.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM TodoItemSearchRow").SingleAsync());

        await database.Database.ExecuteSqlInterpolatedAsync($"UPDATE TodoItem SET Title = {title}");

        Assert.Equal(1, await database.Database.SqlQuery<int>(
            $"SELECT COUNT(*) AS Value FROM TodoItemSearch WHERE TodoItemSearch MATCH {title}").SingleAsync());
    }
}