namespace TaskTracker.Core.Transfer;

/// <summary>One problem found in an import file, located by a JSON path or a CSV row.</summary>
public sealed record TransferIssue(string Path, string Message)
{
    /// <summary>The issue as one line, for dialogs and logs.</summary>
    public override string ToString()
    {
        return $"{Path}: {Message}";
    }
}