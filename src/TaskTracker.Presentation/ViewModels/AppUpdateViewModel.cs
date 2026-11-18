using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

using TaskTracker.Presentation.Installation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// The Check for updates part of App Settings (§7.13). It checks only when the user asks, so the app
/// makes no network call on its own.
/// </summary>
public sealed partial class AppUpdateViewModel : ViewModelBase
{
    public const string CheckingText = "Checking for updates…";

    public const string UpToDateText = "Task Tracker is up to date.";

    public const string CheckFailedText = "Couldn't check for updates. Check your internet connection and try again.";

    public const string FeedUnavailableText =
        "No update feed is available yet. Releases are published to a private or missing repository.";

    public const string NotInstalledText = "Updates are available only in installed builds.";

    public const string DownloadFailedText = "Couldn't download the update. Check your internet connection and try again.";

    public const string ReadyToRestartText =
        "Ready to restart. The update will be installed the next time Task Tracker starts.";

    public const string RestartFailedText =
        "Couldn't restart to update. The update will be installed the next time Task Tracker starts.";

    public const string RestartingText = "Restarting to finish the update…";

    private readonly IUpdateService updates;
    private readonly Func<Task<bool>> confirmRestart;
    private string? availableVersion;

    [ObservableProperty]
    private string? status;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(CheckCommand))]
    [NotifyCanExecuteChangedFor(nameof(DownloadCommand))]
    [NotifyCanExecuteChangedFor(nameof(RestartCommand))]
    private bool isBusy;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(DownloadCommand))]
    private bool isUpdateAvailable;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(CheckCommand))]
    [NotifyCanExecuteChangedFor(nameof(RestartCommand))]
    private bool isReadyToRestart;

    /// <param name="updates">The release feed.</param>
    /// <param name="confirmRestart">Asks whether the app may close now, e.g. when the page has unsaved changes.</param>
    public AppUpdateViewModel(IUpdateService updates, Func<Task<bool>> confirmRestart)
    {
        this.updates = updates;
        this.confirmRestart = confirmRestart;
    }

    public static string AvailableText(string version)
    {
        return $"Version {version} is available.";
    }

    public static string DownloadingText(string version)
    {
        return $"Downloading version {version}…";
    }

    [RelayCommand(CanExecute = nameof(CanCheck))]
    private async Task CheckAsync()
    {
        IsUpdateAvailable = false;

        if (!updates.IsInstalled)
        {
            Status = NotInstalledText;
            return;
        }

        IsBusy = true;
        Status = CheckingText;
        var result = await updates.CheckAsync();
        IsBusy = false;
        ShowCheckResult(result);
    }

    private bool CanCheck()
    {
        return !IsBusy && !IsReadyToRestart;
    }

    private void ShowCheckResult(UpdateCheckResult result)
    {
        availableVersion = result.NewVersion;
        IsUpdateAvailable = result.Outcome == UpdateCheckOutcome.UpdateAvailable;
        Status = result.Outcome switch
        {
            UpdateCheckOutcome.UpToDate => UpToDateText,
            UpdateCheckOutcome.UpdateAvailable => AvailableText(result.NewVersion ?? "?"),
            UpdateCheckOutcome.FeedUnavailable => FeedUnavailableText,
            _ => CheckFailedText,
        };
    }

    [RelayCommand(CanExecute = nameof(CanDownload))]
    private async Task DownloadAsync()
    {
        IsBusy = true;
        Status = DownloadingText(availableVersion ?? "?");

        if (await updates.DownloadAsync())
        {
            IsUpdateAvailable = false;
            IsReadyToRestart = true;
            Status = ReadyToRestartText;
        }
        else
        {
            Status = DownloadFailedText;
        }

        IsBusy = false;
    }

    private bool CanDownload()
    {
        return IsUpdateAvailable && !IsBusy;
    }

    [RelayCommand(CanExecute = nameof(CanRestart))]
    private async Task RestartAsync()
    {
        IsBusy = true;
        if (!await confirmRestart())
        {
            Status = ReadyToRestartText;
            IsBusy = false;
            return;
        }

        if (updates.RestartToUpdate())
        {
            Status = RestartingText;
            return;
        }

        Status = RestartFailedText;
        IsBusy = false;
    }

    private bool CanRestart()
    {
        return IsReadyToRestart && !IsBusy;
    }
}