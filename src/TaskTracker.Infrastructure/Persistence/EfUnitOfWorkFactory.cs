using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Persistence;
using TaskTracker.Core.Undo;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>Creates independent EF contexts for application operations.</summary>
public sealed class EfUnitOfWorkFactory(IDbContextFactory<TaskTrackerDbContext> contexts, IUndoRecorder recorder, DataSaved? saved = null)
    : IUnitOfWorkFactory
{
    public IUnitOfWork Begin()
    {
        return new EfUnitOfWork(contexts.CreateDbContext(), contexts, recorder, saved);
    }
}