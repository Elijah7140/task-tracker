using TaskTracker.Presentation.Installation;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>An update feed with a scripted answer, so tests never reach the network or restart.</summary>
public sealed class FakeUpdateService : IUpdateService
{
    public bool IsInstalled { get; set; } = true;

    public UpdateCheckResult CheckResult { get; set; } = UpdateCheckResult.UpToDate;

    public int DownloadCount { get; private set; }

    public int RestartCount { get; private set; }

    public TaskCompletionSource? DownloadGate { get; set; }

    public Task<UpdateCheckResult> CheckAsync()
    {
        return Task.FromResult(CheckResult);
    }

    public async Task<bool> DownloadAsync()
    {
        DownloadCount++;
        if (DownloadGate is not null)
        {
            await DownloadGate.Task;
        }

        return true;
    }

    public bool RestartToUpdate()
    {
        RestartCount++;
        return true;
    }
}