namespace TaskTracker.Core.Transfer;

/// <summary>How much data an import file holds, or how much an import created.</summary>
public sealed record TransferSummary(int Projects, int Folders, int Items, int SavedSearches)
{
    /// <summary>A summary with nothing in it.</summary>
    public static TransferSummary Empty { get; } = new(0, 0, 0, 0);
}