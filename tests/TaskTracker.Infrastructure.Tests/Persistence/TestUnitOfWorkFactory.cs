using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Persistence;
using TaskTracker.Infrastructure.Persistence;

namespace TaskTracker.Infrastructure.Tests.Persistence;

internal sealed class TestUnitOfWorkFactory(TaskTrackerDbContext database) : IUnitOfWorkFactory
{
    public IUnitOfWork Begin()
    {
        var options = TaskTrackerSqliteOptions.Configure(
            new DbContextOptionsBuilder<TaskTrackerDbContext>(), database.Database.GetDbConnection()).Options;
        return new EfUnitOfWork(new TaskTrackerDbContext(options));
    }
}