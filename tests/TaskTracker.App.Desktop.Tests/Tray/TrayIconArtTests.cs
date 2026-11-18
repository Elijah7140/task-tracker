using Avalonia.Headless.XUnit;

using TaskTracker.App.Desktop.Tray;

namespace TaskTracker.App.Desktop.Tests.Tray;

/// <summary>Keeps the notification-area checklist icon from changing unnoticed.</summary>
public sealed class TrayIconArtTests
{
    [AvaloniaFact]
    public void Tray_icon_matches_the_approved_image()
    {
        using var icon = TrayIconArt.Render();

        SnapshotComparer.AssertMatches(icon, "tray-icon");
    }
}