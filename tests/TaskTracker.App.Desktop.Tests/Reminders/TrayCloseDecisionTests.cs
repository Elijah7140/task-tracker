using Avalonia.Controls;

using TaskTracker.App.Desktop.Reminders;

namespace TaskTracker.App.Desktop.Tests.Reminders;

/// <summary>Checks when closing the window hides it to the tray, minimises it, or quits.</summary>
public sealed class TrayCloseDecisionTests
{
    [Fact]
    public void Closing_hides_to_the_tray_only_when_a_tray_icon_is_shown()
    {
        var state = new TrayCloseState(KeepRunningInTray: true, TrayIconShown: true, Minimized: false, Quitting: false);

        var action = TrayCloseDecision.Decide(state, WindowCloseReason.WindowClosing);

        Assert.Equal(TrayCloseAction.HideToTray, action);
    }

    [Fact]
    public void Closing_without_a_tray_host_minimises_so_the_window_stays_reachable()
    {
        var state = new TrayCloseState(KeepRunningInTray: true, TrayIconShown: false, Minimized: false, Quitting: false);

        var action = TrayCloseDecision.Decide(state, WindowCloseReason.WindowClosing);

        Assert.Equal(TrayCloseAction.Minimize, action);
    }

    [Fact]
    public void Closing_an_already_minimised_window_without_a_tray_host_quits()
    {
        var state = new TrayCloseState(KeepRunningInTray: true, TrayIconShown: false, Minimized: true, Quitting: false);

        var action = TrayCloseDecision.Decide(state, WindowCloseReason.WindowClosing);

        Assert.Equal(TrayCloseAction.Close, action);
    }

    [Theory]
    [InlineData(false, false, WindowCloseReason.WindowClosing)]
    [InlineData(true, true, WindowCloseReason.WindowClosing)]
    [InlineData(true, false, WindowCloseReason.ApplicationShutdown)]
    [InlineData(true, false, WindowCloseReason.OSShutdown)]
    public void Closing_quits_when_the_setting_is_off_quit_was_chosen_or_the_app_shuts_down(
        bool keepRunning, bool quitting, WindowCloseReason reason)
    {
        var state = new TrayCloseState(keepRunning, TrayIconShown: true, Minimized: false, quitting);

        var action = TrayCloseDecision.Decide(state, reason);

        Assert.Equal(TrayCloseAction.Close, action);
    }
}