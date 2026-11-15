using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;

using TaskTracker.Core.Items;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.App.Desktop.Dialogs;

/// <summary>
/// Opens http, https and mailto addresses in the system's default handler through Avalonia's launcher.
/// It re-checks <see cref="LinkPolicy"/> itself, so a file:// path or a custom scheme can never be launched
/// even if a caller forgot to check.
/// </summary>
public sealed class AvaloniaLinkLauncher : ILinkLauncher
{
    private readonly Window? owner;

    public AvaloniaLinkLauncher(Window? owner = null)
    {
        this.owner = owner;
    }

    public async Task<bool> LaunchAsync(Uri uri)
    {
        if (!LinkPolicy.TryCreateUri(uri.OriginalString, out var allowed))
        {
            return false;
        }

        try
        {
            return await GetOwner().Launcher.LaunchUriAsync(allowed);
        }
        catch (Exception exception) when (exception is InvalidOperationException or System.ComponentModel.Win32Exception
            or PlatformNotSupportedException or NotSupportedException)
        {
            return false;
        }
    }

    private Window GetOwner()
    {
        var lifetime = Application.Current?.ApplicationLifetime as IClassicDesktopStyleApplicationLifetime;

        return owner ?? lifetime?.MainWindow ?? throw new InvalidOperationException("Main window is unavailable.");
    }
}