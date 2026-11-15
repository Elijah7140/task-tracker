using TaskTracker.Core.Persistence;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>A backup that only counts how often it ran, so UI tests assert on it and leave no files behind.</summary>
public sealed class CountingDatabaseBackup : IDatabaseBackup
{
    public int Count { get; private set; }

    public string CreateBackup()
    {
        Count++;
        return $"backup-{Count}.db.bak";
    }
}