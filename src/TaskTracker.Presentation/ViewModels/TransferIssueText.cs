using TaskTracker.Core.Transfer;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Turns import issues into short lines for dialogs, keeping a very bad file readable.</summary>
internal static class TransferIssueText
{
    /// <summary>One "path: message" line per issue, at most <paramref name="maxLines"/>, then a count of the rest.</summary>
    public static List<string> Lines(IReadOnlyList<TransferIssue> issues, int maxLines)
    {
        var lines = issues.Take(maxLines).Select(issue => issue.ToString()).ToList();

        if (issues.Count > maxLines)
        {
            lines.Add($"...and {issues.Count - maxLines} more.");
        }

        return lines;
    }
}