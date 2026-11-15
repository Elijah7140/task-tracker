using System.Diagnostics;
using System.Globalization;

using Microsoft.Data.Sqlite;

using TaskTracker.Core.Persistence;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>
/// Copies the SQLite database file with SQLite's backup API into a timestamped <c>.db.bak</c> file beside it,
/// keeping only the five newest backups of its <see cref="BackupPool"/>. Migration backups and import backups
/// are separate pools, so frequent imports never push out the backup taken before a migration.
/// </summary>
public sealed class SqliteDatabaseBackup(string databasePath, TimeProvider clock, BackupPool pool = BackupPool.Migration)
    : IDatabaseBackup
{
    private const int BackupsToKeep = 5;
    private const string Prefix = "tasktracker-";
    private const string ImportPrefix = "tasktracker-import-";

    /// <inheritdoc />
    public string CreateBackup()
    {
        var folder = Path.GetDirectoryName(databasePath)
            ?? throw new InvalidOperationException("Database path needs a parent folder.");
        var stamp = clock.GetUtcNow().ToString("yyyyMMddHHmmssfffffff", CultureInfo.InvariantCulture);
        var prefix = pool == BackupPool.Import ? ImportPrefix : Prefix;
        var backupPath = Path.Combine(folder, $"{prefix}{stamp}.db.bak");

        CopyDatabase(backupPath);
        TryDeleteOldBackups(folder);

        return backupPath;
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

    /// <summary>The backup is already safe, so a file that cannot be deleted is traced and ignored, never fatal.</summary>
    private void TryDeleteOldBackups(string folder)
    {
        try
        {
            DeleteOldBackups(folder);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            Trace.TraceWarning($"Could not remove an old database backup: {exception.Message}");
        }
    }

    private void DeleteOldBackups(string folder)
    {
        var oldest = PoolFiles(folder).OrderByDescending(path => path).Skip(BackupsToKeep);

        foreach (var oldBackup in oldest)
        {
            File.Delete(oldBackup);
        }
    }

    /// <summary>The files of this pool: import backups, or the migration backups whose name continues with the date.</summary>
    private IEnumerable<string> PoolFiles(string folder)
    {
        if (pool == BackupPool.Import)
        {
            return Directory.GetFiles(folder, $"{ImportPrefix}*.db.bak");
        }

        var all = Directory.GetFiles(folder, $"{Prefix}*.db.bak");

        return all.Where(path => char.IsDigit(Path.GetFileName(path)[Prefix.Length]));
    }
}