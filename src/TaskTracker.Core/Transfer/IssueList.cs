namespace TaskTracker.Core.Transfer;

/// <summary>Collects the issues found while validating an import file.</summary>
internal sealed class IssueList
{
    private readonly List<TransferIssue> issues = [];

    public IReadOnlyList<TransferIssue> Items => issues;

    public int Count => issues.Count;

    public void Add(string path, string message)
    {
        issues.Add(new TransferIssue(path, message));
    }
}