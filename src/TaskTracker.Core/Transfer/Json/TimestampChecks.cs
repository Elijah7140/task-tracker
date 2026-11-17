namespace TaskTracker.Core.Transfer.Json;

/// <summary>Checks the optional UTC timestamps of an import document.</summary>
internal static class TimestampChecks
{
    /// <summary>An absent timestamp is fine (the import time is used); a present one must be UTC with a trailing Z.</summary>
    public static void Check(string? text, string path, IssueList issues)
    {
        if (text is not null && !TransferTimeFormat.TryParseUtc(text, out _))
        {
            issues.Add(path, "Expected a UTC timestamp such as 2026-11-13T12:00:00Z.");
        }
    }
}