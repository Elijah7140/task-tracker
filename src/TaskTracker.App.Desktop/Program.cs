using Avalonia;

using TaskTracker.App.Desktop.Installation;
using TaskTracker.App.Desktop.SingleInstance;

using Velopack;

namespace TaskTracker.App.Desktop;

internal static class Program
{
    // Avalonia, third-party APIs and SynchronizationContext-reliant code must not be used
    // before AppMain is called: nothing is initialized yet.
    [STAThread]
    public static void Main(string[] args)
    {
        // First, before the single-instance guard: Velopack's install, update and uninstall hooks run
        // here and exit without opening a window (§7.13). A normal launch continues straight away.
        AddInstallerHooks(VelopackApp.Build()).Run();

        using var guard = SingleInstanceGuard.Acquire(CompositionRoot.ResolveDatabasePath(), Environment.UserName);
        if (guard is null)
        {
            return;
        }

        BuildAvaloniaApp(guard).StartWithClassicDesktopLifetime(args);
    }

    /// <summary>
    /// Removes the start-with-system entry on uninstall. Velopack has an uninstall hook only on
    /// Windows; an AppImage is uninstalled by deleting it.
    /// </summary>
    private static VelopackApp AddInstallerHooks(VelopackApp velopack)
    {
        if (OperatingSystem.IsWindows())
        {
            velopack.OnBeforeUninstallFastCallback(_ => StartupEntries.RemoveOnUninstall());
        }

        return velopack;
    }

    // Also used by the visual designer; keep it public and parameterless.
    public static AppBuilder BuildAvaloniaApp()
    {
        return BuildAvaloniaApp(null);
    }

    private static AppBuilder BuildAvaloniaApp(SingleInstanceGuard? guard)
    {
        return AppBuilder.Configure(() => new App { InstanceGuard = guard })
            .UsePlatformDetect()
#if DEBUG
            .WithDeveloperTools()
#endif
            .WithInterFont()
            .LogToTrace();
    }
}