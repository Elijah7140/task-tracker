using System.Diagnostics;
using System.Net;
using System.Reflection;

using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Threading;

using TaskTracker.Presentation.Installation;

using Velopack;
using Velopack.Locators;
using Velopack.Sources;

namespace TaskTracker.App.Desktop.Installation;

/// <summary>Checks the configured GitHub repository for stable releases through Velopack (§7.13).</summary>
internal sealed class VelopackUpdateService : IUpdateService
{
    private readonly UpdateManager manager;
    private UpdateInfo? pendingUpdate;

    public VelopackUpdateService()
        : this(CurrentLocator())
    {
    }

    internal VelopackUpdateService(IVelopackLocator locator, IFileDownloader? downloader = null)
    {
        var source = new GithubSource(RepositoryUrl(), accessToken: null, prerelease: false, downloader);
        manager = new UpdateManager(source, locator: locator);
    }

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
            pendingUpdate = null;
            return exception is HttpRequestException { StatusCode: HttpStatusCode.NotFound or HttpStatusCode.Unauthorized }
                ? UpdateCheckResult.FeedUnavailable
                : UpdateCheckResult.Failed;
        }

        if (pendingUpdate is null)
        {
            return UpdateCheckResult.UpToDate;
        }

        return UpdateCheckResult.Available(pendingUpdate.TargetFullRelease.Version.ToString());
    }

    /// <inheritdoc />
    public async Task<bool> DownloadAsync()
    {
        if (pendingUpdate is null)
        {
            return false;
        }

        try
        {
            await manager.DownloadUpdatesAsync(pendingUpdate);
            return true;
        }
        catch (Exception exception)
        {
            Trace.TraceWarning($"Update download failed: {exception}");
            return false;
        }
    }

    /// <inheritdoc />
    public bool RestartToUpdate()
    {
        if (Application.Current?.ApplicationLifetime is not IClassicDesktopStyleApplicationLifetime lifetime)
        {
            return false;
        }

        try
        {
            if (manager.UpdatePendingRestart is not { } update)
            {
                return false;
            }

            manager.WaitExitThenApplyUpdates(update, silent: false, restart: true);
        }
        catch (Exception exception)
        {
            Trace.TraceWarning($"Update restart failed: {exception}");
            return false;
        }

        // Exit through Avalonia so the tray and services are disposed and Main releases the instance guard.
        Dispatcher.UIThread.Post(() => lifetime.Shutdown());
        return true;
    }

    private static string RepositoryUrl()
    {
        return typeof(VelopackUpdateService).Assembly.GetCustomAttributes<AssemblyMetadataAttribute>()
            .Single(attribute => attribute.Key == "TaskTrackerUpdateFeedUrl").Value!;
    }

    /// <summary>
    /// The locator that <c>VelopackApp.Run()</c> set in <c>Main</c>, or a fresh one where it never ran,
    /// such as in the designer or a test host; without either, Velopack throws.
    /// </summary>
    private static IVelopackLocator CurrentLocator()
    {
        return VelopackLocator.IsCurrentSet ? VelopackLocator.Current : VelopackLocator.CreateDefaultForPlatform();
    }
}