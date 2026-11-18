namespace TaskTracker.App.Desktop.Reminders;

/// <summary>The facts <see cref="TrayCloseDecision"/> needs when the user closes the main window.</summary>
/// <param name="KeepRunningInTray">The <c>KeepRunningInTray</c> setting.</param>
/// <param name="TrayIconShown">Whether a tray host is showing the app's icon.</param>
/// <param name="Minimized">Whether the window is already minimised.</param>
/// <param name="Quitting">Whether the user chose Quit from the tray menu.</param>
internal readonly record struct TrayCloseState(bool KeepRunningInTray, bool TrayIconShown, bool Minimized, bool Quitting);