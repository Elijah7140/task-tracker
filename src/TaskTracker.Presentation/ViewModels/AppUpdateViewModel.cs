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

    public const string NotInstalledText = "Updates are available only in installed builds.";

    public const string DownloadFailedText = "Couldn't download the update. Check your internet connection and try again.";

    public const string RestartingText = "Restarting to finish the update…";

    private readonly IUpdateService updates;
    private readonly Func<Task<bool>> confirmRestart;
    private string? availableVersion;

    [ObservableProperty]
    private string? status;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(CheckCommand))]
    [NotifyCanExecuteChangedFor(nameof(DownloadAndRestartCommand))]
    private bool isBusy;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(DownloadAndRestartCommand))]
    private bool isUpdateAvailable;

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
        return !IsBusy;
    }

    private void ShowCheckResult(UpdateCheckResult result)
    {
        availableVersion = result.NewVersion;
        IsUpdateAvailable = result.Outcome == UpdateCheckOutcome.UpdateAvailable;
        Status = result.Outcome switch
        {
            UpdateCheckOutcome.UpToDate => UpToDateText,
            UpdateCheckOutcome.UpdateAvailable => AvailableText(result.NewVersion ?? "?"),
            _ => CheckFailedText,
        };
    }

    [RelayCommand(CanExecute = nameof(CanDownloadAndRestart))]
    private async Task DownloadAndRestartAsync()
    {
        if (!await confirmRestart())
        {
            return;
        }

        IsBusy = true;
        Status = DownloadingText(availableVersion ?? "?");

        if (await updates.DownloadAndRestartAsync())
        {
            Status = RestartingText;
            return;
        }

        IsBusy = false;
        Status = DownloadFailedText;
    }

    private bool CanDownloadAndRestart()
    {
        return IsUpdateAvailable && !IsBusy;
    }
}