using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>Backs up an existing database before applying pending migrations.</summary>
public sealed class DatabaseInitializer(
    TaskTrackerDbContext database, string databasePath, TimeProvider clock,
    Func<CancellationToken, Task<bool>>? pendingMigrations = null)
{
    public static string DefaultPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "TaskTracker",
        "tasktracker.db");

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        var folder = Path.GetDirectoryName(databasePath)
            ?? throw new InvalidOperationException("Database path needs a parent folder.");

        Directory.CreateDirectory(folder);
        var databaseExisted = File.Exists(databasePath);
        var hasPendingMigrations = pendingMigrations is null
            ? (await database.Database.GetPendingMigrationsAsync(cancellationToken)).Any()
            : await pendingMigrations(cancellationToken);

        if (databaseExisted && hasPendingMigrations)
        {
            Backup(folder);
        }

        await database.Database.MigrateAsync(cancellationToken);
    }

    private void Backup(string folder)
    {
        var stamp = clock.GetUtcNow().ToString("yyyyMMddHHmmssfffffff", System.Globalization.CultureInfo.InvariantCulture);
        var backupPath = Path.Combine(folder, $"tasktracker-{stamp}.db.bak");
        CopyDatabase(backupPath);
        DeleteOldBackups(folder);
    }

    /// <summary>
    /// Copies the database with SQLite's backup API. The connections are not pooled, so neither
    /// file stays open afterwards (Windows would otherwise keep the backup file locked).
    /// </summary>
    private void CopyDatabase(string backupPath)
    {
        using var source = OpenUnpooled(databasePath, SqliteOpenMode.ReadOnly);
        using var destination = OpenUnpooled(backupPath, SqliteOpenMode.ReadWriteCreate);
        source.BackupDatabase(destination);
    }

    private static SqliteConnection OpenUnpooled(string path, SqliteOpenMode mode)
    {
        var connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = path,
            Mode = mode,
            Pooling = false,
        };
        var connection = new SqliteConnection(connectionString.ToString());
        connection.Open();
        return connection;
    }

    private static void DeleteOldBackups(string folder)
    {
        var backups = Directory.GetFiles(folder, "tasktracker-*.db.bak")
            .OrderByDescending(path => path)
            .Skip(5);

        foreach (var oldBackup in backups)
        {
            File.Delete(oldBackup);
        }
    }
}