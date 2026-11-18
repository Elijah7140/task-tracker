using Avalonia;

namespace TaskTracker.App.Desktop.Tray;

/// <summary>Works out where the tray card appears, in physical screen pixels.</summary>
internal static class TrayPopupPlacement
{
    /// <summary>The gap kept between the card and the cursor or the screen edge.</summary>
    public const int Margin = 12;

    /// <summary>
    /// Centres the card just above the cursor, which is over the tray icon, and keeps it inside the
    /// working area so a taskbar on any edge stays uncovered. Without a cursor position the card
    /// goes in the top-right corner, where Linux and macOS panels keep their tray.
    /// </summary>
    public static PixelPoint Place(PixelRect workingArea, PixelSize card, PixelPoint? cursor)
    {
        var preferred = cursor is PixelPoint point
            ? new PixelPoint(point.X - card.Width / 2, point.Y - card.Height - Margin)
            : new PixelPoint(workingArea.Right - card.Width - Margin, workingArea.Y + Margin);

        return new PixelPoint(
            Clamp(preferred.X, workingArea.X, workingArea.Right - card.Width),
            Clamp(preferred.Y, workingArea.Y, workingArea.Bottom - card.Height));
    }

    private static int Clamp(int value, int lowest, int highest)
    {
        var minimum = lowest + Margin;
        var maximum = Math.Max(minimum, highest - Margin);

        return Math.Clamp(value, minimum, maximum);
    }
}