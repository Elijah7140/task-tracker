using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Persistence;
using TaskTracker.Core.Undo;
using TaskTracker.Infrastructure.Persistence;

namespace TaskTracker.Infrastructure.Tests.Persistence;

/// <summary>Units of work over the connection of an existing context; they record no undo history.</summary>
internal sealed class TestUnitOfWorkFactory(TaskTrackerDbContext database) : IUnitOfWorkFactory
{
    public IUnitOfWork Begin()
    {
        var options = TaskTrackerSqliteOptions.Configure(
            new DbContextOptionsBuilder<TaskTrackerDbContext>(), database.Database.GetDbConnection()).Options;
        var contexts = new FixedOptionsContextFactory(options);
        return new EfUnitOfWork(contexts.CreateDbContext(), contexts, NullUndoRecorder.Instance);
    }

    private sealed class FixedOptionsContextFactory(DbContextOptions<TaskTrackerDbContext> options)
        : IDbContextFactory<TaskTrackerDbContext>
    {
        public TaskTrackerDbContext CreateDbContext()
        {
            return new TaskTrackerDbContext(options);
        }
    }
}