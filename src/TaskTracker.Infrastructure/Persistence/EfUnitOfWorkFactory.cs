using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Persistence;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>Creates independent EF contexts for application operations.</summary>
public sealed class EfUnitOfWorkFactory(IDbContextFactory<TaskTrackerDbContext> contexts) : IUnitOfWorkFactory
{
    public IUnitOfWork Begin()
    {
        return new EfUnitOfWork(contexts.CreateDbContext());
    }
}