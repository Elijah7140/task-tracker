using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Threading;

using TaskTracker.Core.Persistence;
using TaskTracker.Core.Settings;

namespace TaskTracker.App.Desktop.Reminders;

/// <summary>Keeps the window and its scheduler alive when the user closes to the tray.</summary>
internal sealed class ReminderTray : IDisposable
{
    private readonly IClassicDesktopStyleApplicationLifetime lifetime;
    private readonly Window window;
    private readonly SettingsService settings;
    private readonly DataSaved saves;
    private readonly TrayIcon icon;
    private readonly TrayIcons icons;
    private bool quitting;

    public ReminderTray(IClassicDesktopStyleApplicationLifetime lifetime, Window window, SettingsService settings, DataSaved saves)
    {
        this.lifetime = lifetime;
        this.window = window;
        this.settings = settings;
        this.saves = saves;
        icon = CreateIcon();
        var application = Application.Current ?? throw new InvalidOperationException("Avalonia is not initialized.");
        icons = TrayIcon.GetIcons(application) ?? new TrayIcons();
        TrayIcon.SetIcons(application, icons);
        icons.Add(icon);
        window.Closing += OnClosing;
        saves.Committed += OnSaved;
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

    public async Task RefreshAsync()
    {
        if (quitting)
        {
            return;
        }

        var enabled = await settings.GetGlobalAsync(SettingsCatalogue.KeepRunningInTray);
        if (quitting)
        {
            return;
        }

        icon.IsVisible = enabled && icon.NativeMenuExporter is not null;
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

    private void OnSaved()
    {
        Dispatcher.UIThread.Post(async () => await RefreshAsync());
    }

    private void OnClosing(object? sender, WindowClosingEventArgs args)
    {
        if (!quitting && icon.IsVisible && args.CloseReason == WindowCloseReason.WindowClosing)
        {
            args.Cancel = true;
            window.Hide();
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
        saves.Committed -= OnSaved;
        window.Closing -= OnClosing;
        icons.Remove(icon);
        icon.Dispose();
    }
}