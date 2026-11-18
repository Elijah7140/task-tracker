namespace TaskTracker.App.Desktop.Reminders;

/// <summary>What closing the main window does.</summary>
internal enum TrayCloseAction
{
    /// <summary>The window closes and the app quits.</summary>
    Close,

    /// <summary>The window hides; the notification-area icon brings it back.</summary>
    HideToTray,

    /// <summary>The window minimises, because no tray host would show an icon to restore it from.</summary>
    Minimize,
}