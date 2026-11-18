namespace TaskTracker.Presentation.Installation;

/// <summary>What a check for updates found.</summary>
public enum UpdateCheckOutcome
{
    UpToDate,
    UpdateAvailable,
    FeedUnavailable,
    Failed,
}