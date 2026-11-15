namespace TaskTracker.Core.Transfer;

/// <summary>The outcome of an import: either what was created, or the issues that stopped it.</summary>
public sealed class TransferResult
{
    private TransferResult(IReadOnlyList<TransferIssue> issues, TransferSummary summary, string? backupPath)
    {
        Issues = issues;
        Summary = summary;
        BackupPath = backupPath;
    }

    /// <summary>The problems that stopped the import; empty when it succeeded.</summary>
    public IReadOnlyList<TransferIssue> Issues { get; }

    /// <summary>What was created; empty when the import failed.</summary>
    public TransferSummary Summary { get; }

    /// <summary>The database backup taken before the import, when one was taken.</summary>
    public string? BackupPath { get; }

    /// <summary>True when everything was imported.</summary>
    public bool Succeeded => Issues.Count == 0;

    /// <summary>A successful import.</summary>
    public static TransferResult Success(TransferSummary summary, string? backupPath)
    {
        return new TransferResult([], summary, backupPath);
    }

    /// <summary>A failed import; nothing was changed.</summary>
    public static TransferResult Failure(IReadOnlyList<TransferIssue> issues)
    {
        return new TransferResult(issues, TransferSummary.Empty, null);
    }
}