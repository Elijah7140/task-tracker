namespace TaskTracker.Infrastructure.Persistence;

/// <summary>Which kind of backup a copy is. Each kind keeps its own five newest files, so one never evicts the other.</summary>
public enum BackupPool
{
    /// <summary>Taken before applying migrations: <c>tasktracker-yyyyMMdd...db.bak</c>.</summary>
    Migration,

    /// <summary>Taken before an import: <c>tasktracker-import-yyyyMMdd...db.bak</c>.</summary>
    Import
}