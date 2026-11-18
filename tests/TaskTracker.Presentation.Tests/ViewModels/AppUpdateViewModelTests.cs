using TaskTracker.Presentation.Installation;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class AppUpdateViewModelTests
{
    [Fact]
    public async Task Checking_shows_a_checking_status_until_the_feed_answers()
    {
        var updates = new FakeUpdateService { CheckGate = new TaskCompletionSource() };
        var page = CreatePage(updates);

        var check = page.CheckCommand.ExecuteAsync(null);
        var statusWhileChecking = page.Status;
        var busyWhileChecking = page.IsBusy;
        var canCheckAgainWhileChecking = page.CheckCommand.CanExecute(null);
        updates.CheckGate.SetResult();
        await check;

        Assert.Equal(AppUpdateViewModel.CheckingText, statusWhileChecking);
        Assert.True(busyWhileChecking);
        Assert.False(canCheckAgainWhileChecking);
        Assert.False(page.IsBusy);
    }

    [Fact]
    public async Task No_newer_release_shows_up_to_date()
    {
        var updates = new FakeUpdateService { CheckResult = UpdateCheckResult.UpToDate };
        var page = CreatePage(updates);

        await page.CheckCommand.ExecuteAsync(null);

        Assert.Equal(AppUpdateViewModel.UpToDateText, page.Status);
        Assert.False(page.IsUpdateAvailable);
        Assert.False(page.DownloadAndRestartCommand.CanExecute(null));
    }

    [Fact]
    public async Task A_newer_release_is_offered_for_download()
    {
        var updates = new FakeUpdateService { CheckResult = UpdateCheckResult.Available("0.2.0") };
        var page = CreatePage(updates);

        await page.CheckCommand.ExecuteAsync(null);

        Assert.Equal("Version 0.2.0 is available.", page.Status);
        Assert.True(page.IsUpdateAvailable);
        Assert.True(page.DownloadAndRestartCommand.CanExecute(null));
    }

    [Fact]
    public async Task A_failed_check_shows_a_plain_message()
    {
        var updates = new FakeUpdateService { CheckResult = UpdateCheckResult.Failed };
        var page = CreatePage(updates);

        await page.CheckCommand.ExecuteAsync(null);

        Assert.Equal(AppUpdateViewModel.CheckFailedText, page.Status);
        Assert.False(page.IsUpdateAvailable);
        Assert.True(page.CheckCommand.CanExecute(null));
    }

    [Fact]
    public async Task An_uninstalled_build_says_updates_need_an_install_without_asking_the_feed()
    {
        var updates = new FakeUpdateService { IsInstalled = false };
        var page = CreatePage(updates);

        await page.CheckCommand.ExecuteAsync(null);

        Assert.Equal(AppUpdateViewModel.NotInstalledText, page.Status);
        Assert.Equal(0, updates.CheckCount);
    }

    [Fact]
    public async Task Download_and_restart_hands_over_to_the_updater()
    {
        var updates = new FakeUpdateService { CheckResult = UpdateCheckResult.Available("0.2.0") };
        var page = CreatePage(updates);
        await page.CheckCommand.ExecuteAsync(null);

        await page.DownloadAndRestartCommand.ExecuteAsync(null);

        Assert.Equal(1, updates.DownloadCount);
        Assert.Equal(AppUpdateViewModel.RestartingText, page.Status);
        Assert.False(page.CheckCommand.CanExecute(null));
    }

    [Fact]
    public async Task A_failed_download_says_so_and_offers_the_update_again()
    {
        var updates = new FakeUpdateService
        {
            CheckResult = UpdateCheckResult.Available("0.2.0"),
            DownloadSucceeds = false,
        };
        var page = CreatePage(updates);
        await page.CheckCommand.ExecuteAsync(null);

        await page.DownloadAndRestartCommand.ExecuteAsync(null);

        Assert.Equal(AppUpdateViewModel.DownloadFailedText, page.Status);
        Assert.True(page.DownloadAndRestartCommand.CanExecute(null));
    }

    [Fact]
    public async Task Declining_to_close_the_app_keeps_it_running_without_downloading()
    {
        var updates = new FakeUpdateService { CheckResult = UpdateCheckResult.Available("0.2.0") };
        var page = new AppUpdateViewModel(updates, () => Task.FromResult(false));
        await page.CheckCommand.ExecuteAsync(null);

        await page.DownloadAndRestartCommand.ExecuteAsync(null);

        Assert.Equal(0, updates.DownloadCount);
        Assert.Equal("Version 0.2.0 is available.", page.Status);
    }

    private static AppUpdateViewModel CreatePage(FakeUpdateService updates)
    {
        return new AppUpdateViewModel(updates, () => Task.FromResult(true));
    }
}