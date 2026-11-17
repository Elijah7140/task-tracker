using System.Data.Common;

using Microsoft.EntityFrameworkCore;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>Configures the SQLite provider for application and test contexts.</summary>
public static class TaskTrackerSqliteOptions
{
    public static DbContextOptionsBuilder Configure(DbContextOptionsBuilder options,
        string connectionString)
    {
        return options.UseSqlite(connectionString);
    }

    public static DbContextOptionsBuilder<TaskTrackerDbContext> Configure(
        DbContextOptionsBuilder<TaskTrackerDbContext> options, string connectionString)
    {
        return options.UseSqlite(connectionString);
    }

    public static DbContextOptionsBuilder<TaskTrackerDbContext> Configure(
        DbContextOptionsBuilder<TaskTrackerDbContext> options, DbConnection connection)
    {
        return options.UseSqlite(connection);
    }
}