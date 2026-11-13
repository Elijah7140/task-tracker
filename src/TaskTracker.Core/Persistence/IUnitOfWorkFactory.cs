namespace TaskTracker.Core.Persistence;

/// <summary>Creates a fresh unit of work for each application operation.</summary>
public interface IUnitOfWorkFactory
{
    IUnitOfWork Begin();
}