using System.Runtime.Versioning;

using Velopack.Locators;

namespace TaskTracker.App.Desktop.Installation;

/// <summary>Picks the start-with-system entry for the running operating system.</summary>
internal static class StartupEntries
{
    /// <summary>
    /// The entry for an installed app on Windows or Linux; null for a dev build (no stable path)
    /// and on macOS (not supported yet).
    /// </summary>
    public static IStartupEntry? ForInstalledApp(bool isInstalled)
    {
        if (!isInstalled)
        {
            return null;
        }

        if (OperatingSystem.IsWindows() && Environment.ProcessPath is string executablePath)
        {
            return new WindowsStartupEntry(new WindowsRunKey(), executablePath);
        }

        if (OperatingSystem.IsLinux() && LinuxAppImagePath() is string appImagePath)
        {
            return new LinuxStartupEntry(LinuxConfigDirectory(), appImagePath);
        }

        return null;
    }

    /// <summary>Removes the Windows entry; run by the Velopack uninstall hook, which only Windows has.</summary>
    public static void RemoveOnUninstall()
    {
        if (OperatingSystem.IsWindows())
        {
            new WindowsStartupEntry(new WindowsRunKey(), executablePath: string.Empty).Remove();
        }
    }

    /// <summary>The .AppImage file that mounted and ran this process; the mounted copy moves on every run.</summary>
    [SupportedOSPlatform("linux")]
    private static string? LinuxAppImagePath()
    {
        var locator = VelopackLocator.IsCurrentSet ? VelopackLocator.Current as LinuxVelopackLocator : null;

        return string.IsNullOrEmpty(locator?.AppImagePath) ? null : locator.AppImagePath;
    }

    private static string LinuxConfigDirectory()
    {
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);

        return LinuxStartupEntry.ResolveConfigDirectory(Environment.GetEnvironmentVariable("XDG_CONFIG_HOME"), home);
    }
}