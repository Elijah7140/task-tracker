using TaskTracker.App.Desktop.Installation;

namespace TaskTracker.App.Desktop.Tests.Installation;

/// <summary>The real Velopack service in a build Velopack did not install, such as this test run.</summary>
public sealed class VelopackUpdateServiceTests
{
    [Fact]
    public void A_build_velopack_did_not_install_reports_that_it_is_not_installed()
    {
        var updates = new VelopackUpdateService();

        var installed = updates.IsInstalled;

        Assert.False(installed);
    }

    [Fact]
    public async Task Download_and_restart_without_a_found_update_does_nothing()
    {
        var updates = new VelopackUpdateService();

        var restarting = await updates.DownloadAndRestartAsync();

        Assert.False(restarting);
    }

    [Fact]
    public void An_uninstalled_build_has_no_start_with_system_entry()
    {
        var entry = StartupEntries.ForInstalledApp(isInstalled: false);

        Assert.Null(entry);
    }
}