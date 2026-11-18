using Avalonia;

using TaskTracker.App.Desktop.Tray;

namespace TaskTracker.App.Desktop.Tests.Tray;

/// <summary>Checks where the tray card appears relative to the cursor and the working area.</summary>
public sealed class TrayPopupPlacementTests
{
    private static readonly PixelRect AboveBottomTaskbar = new(0, 0, 1920, 1032);
    private static readonly PixelSize Card = new(320, 200);

    [Fact]
    public void Card_sits_centred_just_above_the_cursor()
    {
        var cursor = new PixelPoint(1000, 1050);

        var position = TrayPopupPlacement.Place(AboveBottomTaskbar, Card, cursor);

        Assert.Equal(new PixelPoint(840, 1032 - 200 - TrayPopupPlacement.Margin), position);
    }

    [Fact]
    public void Card_near_the_right_edge_stays_inside_the_working_area()
    {
        var cursor = new PixelPoint(1900, 1050);

        var position = TrayPopupPlacement.Place(AboveBottomTaskbar, Card, cursor);

        Assert.Equal(1920 - 320 - TrayPopupPlacement.Margin, position.X);
    }

    [Fact]
    public void Card_below_a_top_taskbar_stays_inside_the_working_area()
    {
        var belowTopTaskbar = new PixelRect(0, 48, 1920, 1032);
        var cursor = new PixelPoint(1800, 20);

        var position = TrayPopupPlacement.Place(belowTopTaskbar, Card, cursor);

        Assert.Equal(48 + TrayPopupPlacement.Margin, position.Y);
    }

    [Fact]
    public void Card_without_a_cursor_goes_in_the_top_right_corner()
    {
        var position = TrayPopupPlacement.Place(AboveBottomTaskbar, Card, cursor: null);

        Assert.Equal(new PixelPoint(1920 - 320 - TrayPopupPlacement.Margin, TrayPopupPlacement.Margin), position);
    }
}