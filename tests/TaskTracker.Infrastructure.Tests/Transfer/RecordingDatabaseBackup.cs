using TaskTracker.Core.Persistence;

namespace TaskTracker.Infrastructure.Tests.Transfer;

/// <summary>A backup that counts how often it ran, and can be told to fail like a full disk would.</summary>
internal sealed class RecordingDatabaseBackup : IDatabaseBackup
{
    public int Count { get; private set; }

    /// <summary>When true the next backups throw, as when the copy cannot be written.</summary>
    public bool Fail { get; set; }

    public string CreateBackup()
    {
        if (Fail)
        {
            throw new InvalidOperationException("The disk is full.");
        }

        Count++;
        return $"backup-{Count}.db.bak";
    }
}