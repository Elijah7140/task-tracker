namespace TaskTracker.Presentation.Installation;

/// <summary>Checks the release feed for a newer version and installs it (§7.13).</summary>
public interface IUpdateService
{
    /// <summary>True when the app runs from an install that can update itself, not a dev or test build.</summary>
    bool IsInstalled { get; }

    /// <summary>Asks the release feed for a newer version. Failures are reported in the result, not thrown.</summary>
    Task<UpdateCheckResult> CheckAsync();

    /// <summary>
    /// Downloads the version the last check found, then closes the app so it restarts on the new
    /// version. Returns false, and keeps the app running, if the download or hand-over failed.
    /// </summary>
    Task<bool> DownloadAndRestartAsync();
}