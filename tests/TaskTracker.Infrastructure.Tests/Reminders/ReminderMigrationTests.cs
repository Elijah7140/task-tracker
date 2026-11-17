#pragma warning disable xUnit1051
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

using TaskTracker.Infrastructure.Persistence;

namespace TaskTracker.Infrastructure.Tests.Reminders;

/// <summary>Checks upgrade and rollback of populated reminder data and its existing FTS index.</summary>
public sealed class ReminderMigrationTests
{
    private const string PreviousMigration = "20261117211849_AddRecurrence";

    [Fact]
    public async Task Adding_and_dropping_reminders_preserves_the_fts_rows_and_triggers()
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
        Assert.Null(existing.ReminderMode);
        Assert.Null(existing.ReminderDeliveredFor);
        Assert.Null(existing.SnoozedUntilUtc);
        await VerifyFtsAsync(database, "before", "upgraded");

        await migrator.MigrateAsync(PreviousMigration);
        await VerifyFtsAsync(database, "upgraded", "downgraded");
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
                'before', 0, '2026-11-13', '2026-11-13')
            """);
    }

    private static async Task VerifyFtsAsync(TaskTrackerDbContext database, string oldTitle, string newTitle)
    {
        var triggers = await database.Database.SqlQueryRaw<string>(
            "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'TodoItemSearch%' ORDER BY name")
            .ToListAsync();
        Assert.Equal(["TodoItemSearchRow_Delete", "TodoItemSearch_Delete", "TodoItemSearch_Insert", "TodoItemSearch_Update"], triggers);
        Assert.Equal(1, await database.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM TodoItemSearchRow").SingleAsync());

        Assert.Equal(1, await CountMatchesAsync(database, oldTitle));
        await database.Database.ExecuteSqlInterpolatedAsync($"UPDATE TodoItem SET Title = {newTitle}");
        Assert.Equal(0, await CountMatchesAsync(database, oldTitle));
        Assert.Equal(1, await CountMatchesAsync(database, newTitle));
    }

    private static Task<int> CountMatchesAsync(TaskTrackerDbContext database, string title)
    {
        return database.Database.SqlQuery<int>(
            $"SELECT COUNT(*) AS Value FROM TodoItemSearch WHERE TodoItemSearch MATCH {title}").SingleAsync();
    }
}