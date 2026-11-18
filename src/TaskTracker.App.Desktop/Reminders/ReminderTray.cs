using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Threading;

using TaskTracker.Core.Persistence;
using TaskTracker.Core.Settings;

namespace TaskTracker.App.Desktop.Reminders;

/// <summary>
/// Keeps the window and its scheduler alive when the user closes it with <c>KeepRunningInTray</c>
/// on: hidden to a tray icon when a tray host shows one, minimised otherwise (§7.12).
/// </summary>
internal sealed class ReminderTray : IDisposable
{
    private readonly IClassicDesktopStyleApplicationLifetime lifetime;
    private readonly Window window;
    private readonly SettingsService settings;
    private readonly DataSaved saves;
    private readonly Func<Exception, Task> reportError;
    private readonly TrayIcon icon;
    private readonly TrayIcons icons;
    private bool keepRunning;
    private bool quitting;

    public ReminderTray(IClassicDesktopStyleApplicationLifetime lifetime, Window window, SettingsService settings,
        DataSaved saves, Func<Exception, Task> reportError)
    {
        this.lifetime = lifetime;
        this.window = window;
        this.settings = settings;
        this.saves = saves;
        this.reportError = reportError;
        icon = CreateIcon();
        var application = Application.Current ?? throw new InvalidOperationException("Avalonia is not initialized.");
        icons = TrayIcon.GetIcons(application) ?? new TrayIcons();
        TrayIcon.SetIcons(application, icons);
        icons.Add(icon);
        window.Closing += OnClosing;
        saves.GlobalSettingsCommitted += OnSettingsSaved;
    }

    public void Open()
    {
        if (!window.IsVisible)
        {
            window.Show();
        }

        if (window.WindowState == WindowState.Minimized)
        {
            window.WindowState = WindowState.Normal;
        }

        window.Activate();
    }

    /// <summary>Re-reads <c>KeepRunningInTray</c> and whether a tray host is present.</summary>
    public async Task RefreshAsync()
    {
        if (quitting)
        {
            return;
        }

        var enabled = await settings.GetGlobalAsync(SettingsCatalogue.KeepRunningInTray);
        var hostAvailable = enabled && await TrayHostProbe.IsAvailableAsync();
        if (quitting)
        {
            return;
        }

        keepRunning = enabled;
        icon.IsVisible = hostAvailable && icon.NativeMenuExporter is not null;
        if (!icon.IsVisible && !window.IsVisible)
        {
            Open();
        }
    }

    private TrayIcon CreateIcon()
    {
        var open = new NativeMenuItem("Open");
        open.Click += (_, _) => Open();
        var quit = new NativeMenuItem("Quit");
        quit.Click += (_, _) => Quit();
        var tray = new TrayIcon
        {
            Icon = window.Icon,
            ToolTipText = "Task Tracker",
            IsVisible = false,
            Menu = new NativeMenu { Items = { open, quit } },
        };
        tray.Clicked += (_, _) => Open();
        return tray;
    }

    private void OnSettingsSaved()
    {
        Dispatcher.UIThread.Post(RefreshAfterSettingsSaved);
    }

    private async void RefreshAfterSettingsSaved()
    {
        try
        {
            await RefreshAsync();
        }
        catch (Exception exception)
        {
            await reportError(exception);
        }
    }

    private void OnClosing(object? sender, WindowClosingEventArgs args)
    {
        var minimized = window.WindowState == WindowState.Minimized;
        var state = new TrayCloseState(keepRunning, icon.IsVisible, minimized, quitting);
        var action = TrayCloseDecision.Decide(state, args.CloseReason);
        if (action == TrayCloseAction.HideToTray)
        {
            args.Cancel = true;
            window.Hide();
        }
        else if (action == TrayCloseAction.Minimize)
        {
            args.Cancel = true;
            window.WindowState = WindowState.Minimized;
        }
    }

    private void Quit()
    {
        quitting = true;
        lifetime.Shutdown();
    }

    public void Dispose()
    {
        quitting = true;
        saves.GlobalSettingsCommitted -= OnSettingsSaved;
        window.Closing -= OnClosing;
        icons.Remove(icon);
        icon.Dispose();
    }
}