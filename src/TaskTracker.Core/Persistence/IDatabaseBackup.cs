namespace TaskTracker.Core.Persistence;

/// <summary>Takes a safety copy of the whole database before a risky bulk change.</summary>
public interface IDatabaseBackup
{
    /// <summary>Writes a backup file next to the database and returns its path.</summary>
    string CreateBackup();
}