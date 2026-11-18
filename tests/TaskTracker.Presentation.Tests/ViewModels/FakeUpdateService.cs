using TaskTracker.Presentation.Installation;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>An update feed with scripted answers; <see cref="CheckGate"/> holds a check open.</summary>
internal sealed class FakeUpdateService : IUpdateService
{
    public bool IsInstalled { get; set; } = true;

    public UpdateCheckResult CheckResult { get; set; } = UpdateCheckResult.UpToDate;

    public bool DownloadSucceeds { get; set; } = true;

    public TaskCompletionSource? CheckGate { get; set; }

    public int CheckCount { get; private set; }

    public int DownloadCount { get; private set; }

    public async Task<UpdateCheckResult> CheckAsync()
    {
        CheckCount++;
        if (CheckGate is not null)
        {
            await CheckGate.Task;
        }

        return CheckResult;
    }

    public Task<bool> DownloadAndRestartAsync()
    {
        DownloadCount++;
        return Task.FromResult(DownloadSucceeds);
    }
}