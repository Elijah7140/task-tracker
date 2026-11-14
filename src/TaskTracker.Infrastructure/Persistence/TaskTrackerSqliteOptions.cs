using System.Data.Common;

using Microsoft.EntityFrameworkCore;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>Configures SQLite and the search functions for application and test contexts.</summary>
public static class TaskTrackerSqliteOptions
{
    private static readonly UnicodeFoldInterceptor FoldInterceptor = new();

    public static DbContextOptionsBuilder Configure(DbContextOptionsBuilder options,
        string connectionString)
    {
        return options.UseSqlite(connectionString).AddInterceptors(FoldInterceptor);
    }

    public static DbContextOptionsBuilder<TaskTrackerDbContext> Configure(
        DbContextOptionsBuilder<TaskTrackerDbContext> options, string connectionString)
    {
        return options.UseSqlite(connectionString).AddInterceptors(FoldInterceptor);
    }

    public static DbContextOptionsBuilder<TaskTrackerDbContext> Configure(
        DbContextOptionsBuilder<TaskTrackerDbContext> options, DbConnection connection)
    {
        UnicodeFoldInterceptor.Register(connection);
        return options.UseSqlite(connection).AddInterceptors(FoldInterceptor);
    }
}