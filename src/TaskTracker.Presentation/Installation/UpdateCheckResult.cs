namespace TaskTracker.Presentation.Installation;

/// <summary>The result of a check for updates; <paramref name="NewVersion"/> is set only when one is available.</summary>
public sealed record UpdateCheckResult(UpdateCheckOutcome Outcome, string? NewVersion = null)
{
    public static UpdateCheckResult UpToDate { get; } = new(UpdateCheckOutcome.UpToDate);

    public static UpdateCheckResult Failed { get; } = new(UpdateCheckOutcome.Failed);

    public static UpdateCheckResult Available(string newVersion)
    {
        return new UpdateCheckResult(UpdateCheckOutcome.UpdateAvailable, newVersion);
    }
}