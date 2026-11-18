using System.Diagnostics;

using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Threading;

using TaskTracker.Presentation.Installation;

using Velopack;
using Velopack.Locators;
using Velopack.Sources;

namespace TaskTracker.App.Desktop.Installation;

/// <summary>Checks this repository's GitHub Releases for updates through Velopack (§7.13).</summary>
internal sealed class VelopackUpdateService : IUpdateService
{
    /// <summary>The repository whose releases carry the Velopack release files.</summary>
    public const string RepositoryUrl = "https://github.com/Elijah7140/task-tracker";

    private readonly UpdateManager manager = new(
        new GithubSource(RepositoryUrl, accessToken: null, prerelease: false), locator: CurrentLocator());

    private UpdateInfo? pendingUpdate;

    /// <inheritdoc />
    public bool IsInstalled => manager.IsInstalled;

    /// <inheritdoc />
    public async Task<UpdateCheckResult> CheckAsync()
    {
        try
        {
            pendingUpdate = await manager.CheckForUpdatesAsync();
        }
        catch (Exception exception)
        {
            Trace.TraceWarning($"Update check failed: {exception}");
            return UpdateCheckResult.Failed;
        }

        if (pendingUpdate is null)
        {
            return UpdateCheckResult.UpToDate;
        }

        return UpdateCheckResult.Available(pendingUpdate.TargetFullRelease.Version.ToString());
    }

    /// <inheritdoc />
    public async Task<bool> DownloadAndRestartAsync()
    {
        if (pendingUpdate is null)
        {
            return false;
        }

        try
        {
            await manager.DownloadUpdatesAsync(pendingUpdate);
            manager.WaitExitThenApplyUpdates(pendingUpdate.TargetFullRelease, silent: false, restart: true);
        }
        catch (Exception exception)
        {
            Trace.TraceWarning($"Update download failed: {exception}");
            return false;
        }

        ShutDown();
        return true;
    }

    /// <summary>
    /// The locator that <c>VelopackApp.Run()</c> set in <c>Main</c>, or a fresh one where it never ran,
    /// such as in the designer or a test host; without either, Velopack throws.
    /// </summary>
    private static IVelopackLocator CurrentLocator()
    {
        return VelopackLocator.IsCurrentSet ? VelopackLocator.Current : VelopackLocator.CreateDefaultForPlatform();
    }

    /// <summary>
    /// Closes the app normally, so the tray icon and services are disposed; the Velopack updater
    /// waits for this process to exit, applies the update and starts the new version.
    /// </summary>
    private static void ShutDown()
    {
        if (Application.Current?.ApplicationLifetime is IClassicDesktopStyleApplicationLifetime lifetime)
        {
            Dispatcher.UIThread.Post(() => lifetime.Shutdown());
        }
    }
}