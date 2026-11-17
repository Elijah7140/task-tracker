using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>Creates the context for migration tooling.</summary>
public sealed class TaskTrackerDesignTimeFactory : IDesignTimeDbContextFactory<TaskTrackerDbContext>
{
    public TaskTrackerDbContext CreateDbContext(string[] args)
    {
        var options = TaskTrackerSqliteOptions.Configure(
            new DbContextOptionsBuilder<TaskTrackerDbContext>(), "Data Source=tasktracker-design.db").Options;

        return new TaskTrackerDbContext(options);
    }
}