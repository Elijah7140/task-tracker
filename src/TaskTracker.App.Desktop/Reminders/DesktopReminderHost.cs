using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;

using Microsoft.Extensions.DependencyInjection;

using TaskTracker.Core.Persistence;
using TaskTracker.Core.Reminders;
using TaskTracker.Core.Settings;
using TaskTracker.Presentation.Reminders;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Reminders;

/// <summary>Connects the reminder scheduler, window activation, and optional notification-area icon.</summary>
internal sealed class DesktopReminderHost : IDisposable
{
    private readonly Window window;
    private readonly RemindersViewModel panel;
    private readonly ReminderScheduler scheduler;
    private readonly DesktopReminderNotifier notifier;
    private readonly ReminderTray tray;
    private readonly MainWindowViewModel shell;
    private LinuxResumeMonitor? resume;

    public DesktopReminderHost(IServiceProvider services, IClassicDesktopStyleApplicationLifetime lifetime,
        Window window, MainWindowViewModel shell)
    {
        this.window = window;
        this.shell = shell;
        panel = shell.EnableReminders(services.GetRequiredService<ReminderService>());
        notifier = services.GetRequiredService<DesktopReminderNotifier>();
        scheduler = services.GetRequiredService<ReminderScheduler>();
        tray = new ReminderTray(lifetime, window, services.GetRequiredService<SettingsService>(),
            services.GetRequiredService<DataSaved>());
        scheduler.Delivered += panel.Add;
        scheduler.RefreshPanelAsync = panel.RefreshAsync;
        window.Activated += OnActivated;
    }

    public async Task StartAsync()
    {
        AttachNotifier();
        await tray.RefreshAsync();
        await scheduler.StartAsync();
        if (resume is not null)
        {
            await resume.StartAsync();
        }
    }

    private void AttachNotifier()
    {
        try
        {
            if (OperatingSystem.IsWindows() && window.TryGetPlatformHandle() is { } handle)
            {
                notifier.Use(new WindowsReminderNotifier(handle.Handle, Activate, scheduler.RequestCheck));
            }
            else if (OperatingSystem.IsLinux())
            {
                notifier.Use(new LinuxReminderNotifier(Activate));
                resume = new LinuxResumeMonitor(scheduler.RequestCheck);
            }
        }
        catch (Exception exception)
        {
            notifier.ReportFailure(exception);
        }
    }

    private void OnActivated(object? sender, EventArgs args)
    {
        scheduler.RequestCheck();
    }

    private async void Activate(Guid? itemId)
    {
        try
        {
            tray.Open();
            if (itemId is Guid item)
            {
                await panel.OpenAsync(item);
            }
            else
            {
                panel.IsOpen = true;
            }
        }
        catch (Exception exception)
        {
            await shell.ReportUnexpectedErrorAsync(exception);
        }
    }

    public void Dispose()
    {
        window.Activated -= OnActivated;
        scheduler.Delivered -= panel.Add;
        scheduler.RefreshPanelAsync = null;
        scheduler.Dispose();
        resume?.Dispose();
        notifier.Dispose();
        tray.Dispose();
    }
}