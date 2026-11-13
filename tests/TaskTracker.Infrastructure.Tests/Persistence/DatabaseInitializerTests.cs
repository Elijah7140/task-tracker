#pragma warning disable xUnit1051
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

using TaskTracker.Infrastructure.Persistence;

namespace TaskTracker.Infrastructure.Tests.Persistence;

public sealed class DatabaseInitializerTests
{
    [Fact]
    public async Task Backup_includes_committed_wal_pages()
    {
        var folder = Path.Combine(Path.GetTempPath(), $"tasktracker-wal-{Guid.CreateVersion7()}");
        Directory.CreateDirectory(folder);
        var path = Path.Combine(folder, "tasktracker.db");

        try
        {
            var options = new DbContextOptionsBuilder<TaskTrackerDbContext>()
                .UseSqlite($"Data Source={path}").Options;
            await using (var database = new TaskTrackerDbContext(options))
            {
                await database.Database.MigrateAsync();
            }

            await using var writer = new SqliteConnection($"Data Source={path}");
            await writer.OpenAsync();
            await using (var mode = writer.CreateCommand())
            {
                mode.CommandText = "PRAGMA journal_mode=WAL";
                await mode.ExecuteNonQueryAsync();
            }

            await using (var marker = writer.CreateCommand())
            {
                marker.CommandText = "CREATE TABLE BackupMarker (Value TEXT); INSERT INTO BackupMarker VALUES ('committed')";
                await marker.ExecuteNonQueryAsync();
            }

            await using (var database = new TaskTrackerDbContext(options))
            {
                var initializer = new DatabaseInitializer(database, path, TimeProvider.System,
                    _ => Task.FromResult(true));
                await initializer.InitializeAsync();
            }

            var backup = Assert.Single(Directory.GetFiles(folder, "tasktracker-*.db.bak"));
            await using var reader = new SqliteConnection($"Data Source={backup}");
            await reader.OpenAsync();
            await using var query = reader.CreateCommand();
            query.CommandText = "SELECT Value FROM BackupMarker";

            Assert.Equal("committed", await query.ExecuteScalarAsync());
        }
        finally
        {
            Directory.Delete(folder, true);
        }
    }

    [Fact]
    public async Task Existing_database_is_backed_up_before_migration()
    {
        var folder = Path.Combine(Path.GetTempPath(), $"tasktracker-test-{Guid.CreateVersion7()}");
        Directory.CreateDirectory(folder);
        var databasePath = Path.Combine(folder, "tasktracker.db");

        try
        {
            await File.WriteAllBytesAsync(databasePath, [], TestContext.Current.CancellationToken);
            var options = new DbContextOptionsBuilder<TaskTrackerDbContext>()
                .UseSqlite($"Data Source={databasePath}")
                .Options;
            await using var database = new TaskTrackerDbContext(options);
            var initializer = new DatabaseInitializer(database, databasePath, TimeProvider.System);

            await initializer.InitializeAsync(TestContext.Current.CancellationToken);
            var migrations = await database.Database.GetAppliedMigrationsAsync(TestContext.Current.CancellationToken);

            Assert.Single(Directory.GetFiles(folder, "tasktracker-*.db.bak"));
            Assert.NotEmpty(migrations);
        }
        finally
        {
            Directory.Delete(folder, true);
        }
    }

    [Fact]
    public async Task Fresh_database_is_migrated_without_backup()
    {
        var folder = Path.Combine(Path.GetTempPath(), $"tasktracker-test-{Guid.CreateVersion7()}");
        Directory.CreateDirectory(folder);
        var path = Path.Combine(folder, "tasktracker.db");

        try
        {
            var options = new DbContextOptionsBuilder<TaskTrackerDbContext>()
                .UseSqlite($"Data Source={path}").Options;
            await using var database = new TaskTrackerDbContext(options);
            var initializer = new DatabaseInitializer(database, path, TimeProvider.System);

            await initializer.InitializeAsync(TestContext.Current.CancellationToken);

            Assert.True(File.Exists(path));
            Assert.Empty(Directory.GetFiles(folder, "tasktracker-*.db.bak"));
            Assert.NotEmpty(await database.Database.GetAppliedMigrationsAsync(TestContext.Current.CancellationToken));
        }
        finally
        {
            Directory.Delete(folder, true);
        }
    }

    [Fact]
    public async Task Current_database_is_not_backed_up_on_reinitialization()
    {
        var folder = Path.Combine(Path.GetTempPath(), $"tasktracker-test-{Guid.CreateVersion7()}");
        Directory.CreateDirectory(folder);
        var path = Path.Combine(folder, "tasktracker.db");

        try
        {
            var options = new DbContextOptionsBuilder<TaskTrackerDbContext>()
                .UseSqlite($"Data Source={path}").Options;
            await using (var database = new TaskTrackerDbContext(options))
            {
                await new DatabaseInitializer(database, path, TimeProvider.System)
                    .InitializeAsync(TestContext.Current.CancellationToken);
            }

            await using var reopened = new TaskTrackerDbContext(options);
            await new DatabaseInitializer(reopened, path, TimeProvider.System)
                .InitializeAsync(TestContext.Current.CancellationToken);

            Assert.Empty(Directory.GetFiles(folder, "tasktracker-*.db.bak"));
        }
        finally
        {
            Directory.Delete(folder, true);
        }
    }

    [Fact]
    public async Task Pending_migration_backup_retains_only_five_newest_copies()
    {
        var folder = Path.Combine(Path.GetTempPath(), $"tasktracker-test-{Guid.CreateVersion7()}");
        Directory.CreateDirectory(folder);
        var path = Path.Combine(folder, "tasktracker.db");

        try
        {
            var options = new DbContextOptionsBuilder<TaskTrackerDbContext>()
                .UseSqlite($"Data Source={path}").Options;
            for (var index = 0; index < 6; index++)
            {
                var oldBackup = Path.Combine(folder, $"tasktracker-2020010100000{index}000000.db.bak");
                await File.WriteAllTextAsync(oldBackup, "old", TestContext.Current.CancellationToken);
            }

            await File.WriteAllBytesAsync(path, [], TestContext.Current.CancellationToken);
            await using var database = new TaskTrackerDbContext(options);
            var initializer = new DatabaseInitializer(database, path, TimeProvider.System);

            await initializer.InitializeAsync(TestContext.Current.CancellationToken);
            var backups = Directory.GetFiles(folder, "tasktracker-*.db.bak");

            Assert.Equal(5, backups.Length);
            Assert.DoesNotContain(backups, backup => backup.Contains("20200101000000", StringComparison.Ordinal));
        }
        finally
        {
            Directory.Delete(folder, true);
        }
    }
}