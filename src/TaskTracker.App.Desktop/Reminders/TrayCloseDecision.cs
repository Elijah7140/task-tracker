using Avalonia.Controls;

namespace TaskTracker.App.Desktop.Reminders;

/// <summary>Decides how a user's close request is handled when the app keeps running for reminders.</summary>
internal static class TrayCloseDecision
{
    /// <summary>
    /// Keeps running only for a user close with <c>KeepRunningInTray</c> on. Hides to the tray only
    /// when a tray icon is really shown; otherwise minimises, so the window is never unreachable.
    /// Closing a window that is already minimised (from the taskbar) quits, so quitting stays possible.
    /// </summary>
    public static TrayCloseAction Decide(TrayCloseState state, WindowCloseReason reason)
    {
        if (!state.KeepRunningInTray || state.Quitting || reason != WindowCloseReason.WindowClosing)
        {
            return TrayCloseAction.Close;
        }

        if (state.TrayIconShown)
        {
            return TrayCloseAction.HideToTray;
        }

        return state.Minimized ? TrayCloseAction.Close : TrayCloseAction.Minimize;
    }
}