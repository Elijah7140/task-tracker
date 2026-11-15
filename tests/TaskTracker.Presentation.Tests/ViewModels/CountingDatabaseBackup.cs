using TaskTracker.Core.Persistence;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>A backup that only counts how often it was asked to run, so tests leave no files behind.</summary>
internal sealed class CountingDatabaseBackup : IDatabaseBackup
{
    public int Count { get; private set; }

    public string CreateBackup()
    {
        Count++;
        return $"backup-{Count}.db.bak";
    }
}