namespace TaskTracker.Core.Transfer.Json;

/// <summary>
/// The result of reading and validating an import file, before anything is written. When
/// <see cref="Issues"/> is empty the file can be imported.
/// </summary>
public sealed class JsonImportCheck
{
    internal JsonImportCheck(ExportDocument? document, IReadOnlyList<TransferIssue> issues, TransferSummary summary)
    {
        Document = document;
        Issues = issues;
        Summary = summary;
    }

    /// <summary>The problems found, each with a JSON path; empty when the file is valid.</summary>
    public IReadOnlyList<TransferIssue> Issues { get; }

    /// <summary>How much the file holds (empty when it could not be read).</summary>
    public TransferSummary Summary { get; }

    /// <summary>True when the file passed every check.</summary>
    public bool IsValid => Issues.Count == 0;

    internal ExportDocument? Document { get; }
}