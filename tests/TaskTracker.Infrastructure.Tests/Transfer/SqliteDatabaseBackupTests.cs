using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Time.Testing;

using TaskTracker.Infrastructure.Persistence;

namespace TaskTracker.Infrastructure.Tests.Transfer;

public sealed class SqliteDatabaseBackupTests
{
    [Fact]
    public void Import_and_migration_backups_are_separate_files_with_separate_prefixes()
    {
        using var folder = new BackupFolder();

        var migration = new SqliteDatabaseBackup(folder.DatabasePath, folder.Clock, BackupPool.Migration).CreateBackup();
        var import = new SqliteDatabaseBackup(folder.DatabasePath, folder.Clock, BackupPool.Import).CreateBackup();

        Assert.StartsWith("tasktracker-2", Path.GetFileName(migration));
        Assert.StartsWith("tasktracker-import-2", Path.GetFileName(import));
        Assert.True(File.Exists(migration));
        Assert.True(File.Exists(import));
    }

    [Fact]
    public void Many_import_backups_never_remove_the_migration_backup()
    {
        using var folder = new BackupFolder();
        var migration = new SqliteDatabaseBackup(folder.DatabasePath, folder.Clock, BackupPool.Migration).CreateBackup();
        var imports = new SqliteDatabaseBackup(folder.DatabasePath, folder.Clock, BackupPool.Import);

        for (var count = 0; count < 8; count++)
        {
            folder.Clock.Advance(TimeSpan.FromMinutes(1));
            imports.CreateBackup();
        }

        Assert.True(File.Exists(migration));
        Assert.Equal(5, Directory.GetFiles(folder.Path, "tasktracker-import-*.db.bak").Length);
    }

    [Fact]
    public void Many_migration_backups_never_remove_import_backups()
    {
        using var folder = new BackupFolder();
        var import = new SqliteDatabaseBackup(folder.DatabasePath, folder.Clock, BackupPool.Import).CreateBackup();
        var migrations = new SqliteDatabaseBackup(folder.DatabasePath, folder.Clock, BackupPool.Migration);

        for (var count = 0; count < 8; count++)
        {
            folder.Clock.Advance(TimeSpan.FromMinutes(1));
            migrations.CreateBackup();
        }

        Assert.True(File.Exists(import));
        Assert.Equal(5, Directory.GetFiles(folder.Path, "tasktracker-2*.db.bak").Length);
    }

    [Fact]
    public void A_backup_file_that_cannot_be_deleted_does_not_fail_the_backup()
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "Needs a file locked against deletion.");
        using var folder = new BackupFolder();
        var backup = new SqliteDatabaseBackup(folder.DatabasePath, folder.Clock, BackupPool.Import);
        var oldest = backup.CreateBackup();

        for (var count = 0; count < 4; count++)
        {
            folder.Clock.Advance(TimeSpan.FromMinutes(1));
            backup.CreateBackup();
        }

        using var lockedFile = new FileStream(oldest, FileMode.Open, FileAccess.Read, FileShare.Read);
        folder.Clock.Advance(TimeSpan.FromMinutes(1));

        var created = backup.CreateBackup();

        Assert.True(File.Exists(created));
        Assert.True(File.Exists(oldest));
    }

    private sealed class BackupFolder : IDisposable
    {
        public BackupFolder()
        {
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"tasktracker-backup-{Guid.CreateVersion7()}");
            Directory.CreateDirectory(Path);
            DatabasePath = System.IO.Path.Combine(Path, "tasktracker.db");
            CreateDatabase();
        }

        public string Path { get; }

        public string DatabasePath { get; }

        public FakeTimeProvider Clock { get; } = new(new DateTimeOffset(2026, 11, 13, 12, 0, 0, TimeSpan.Zero));

        public void Dispose()
        {
            SqliteConnection.ClearAllPools();
            Directory.Delete(Path, recursive: true);
        }

        private void CreateDatabase()
        {
            using var connection = new SqliteConnection(
                new SqliteConnectionStringBuilder { DataSource = DatabasePath, Pooling = false }.ToString());
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = "CREATE TABLE Sample (Id INTEGER PRIMARY KEY);";
            command.ExecuteNonQuery();
        }
    }
}