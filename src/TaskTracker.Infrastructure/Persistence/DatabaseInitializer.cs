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
            new SqliteDatabaseBackup(databasePath, clock).CreateBackup();
        }

        await database.Database.MigrateAsync(cancellationToken);
    }
}