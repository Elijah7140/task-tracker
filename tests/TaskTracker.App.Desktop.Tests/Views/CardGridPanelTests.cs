using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless.XUnit;

using TaskTracker.App.Desktop.Views;

namespace TaskTracker.App.Desktop.Tests.Views;

/// <summary>Layout rules of the workspace card grid (§7.17).</summary>
public sealed class CardGridPanelTests
{
    [AvaloniaFact]
    public void Cards_share_the_width_and_each_row_is_as_tall_as_its_tallest_card()
    {
        var panel = Panel(columns: 4, 50, 120, 80, 60, 40);

        Layout(panel, width: 1036);

        Assert.Equal(new Rect(0, 0, 250, 120), panel.Children[0].Bounds);
        Assert.Equal(new Rect(262, 0, 250, 120), panel.Children[1].Bounds);
        Assert.Equal(new Rect(786, 0, 250, 120), panel.Children[3].Bounds);
        Assert.Equal(new Rect(0, 132, 250, 40), panel.Children[4].Bounds);
        Assert.Equal(172, panel.DesiredSize.Height);
    }

    [AvaloniaFact]
    public void Rows_are_never_shorter_than_the_minimum_row_height()
    {
        var panel = Panel(columns: 2, 50, 300, 40);
        panel.MinRowHeight = 200;

        Layout(panel, width: 812);

        Assert.Equal(300, panel.Children[0].Bounds.Height);
        Assert.Equal(200, panel.Children[2].Bounds.Height);
        Assert.Equal(300 + 12 + 200, panel.DesiredSize.Height);
    }

    [AvaloniaFact]
    public void A_narrow_panel_uses_fewer_columns_than_the_setting()
    {
        var panel = Panel(columns: 4, 50, 50, 50);

        Layout(panel, width: 500);

        Assert.Equal(2, panel.ColumnsFor(500));
        Assert.Equal(new Rect(0, 62, 244, 50), panel.Children[2].Bounds);
    }

    [AvaloniaFact]
    public void Changing_the_column_count_reflows_the_cards()
    {
        var panel = Panel(columns: 4, 50, 50, 50, 50);
        Layout(panel, width: 1036);

        panel.Columns = 2;
        Layout(panel, width: 1036);

        Assert.Equal(512, panel.Children[0].Bounds.Width);
        Assert.Equal(new Rect(0, 62, 512, 50), panel.Children[2].Bounds);
    }

    private static CardGridPanel Panel(int columns, params double[] heights)
    {
        var panel = new CardGridPanel { Columns = columns };

        foreach (var height in heights)
        {
            panel.Children.Add(new Border { MinHeight = height });
        }

        return panel;
    }

    private static void Layout(CardGridPanel panel, double width)
    {
        panel.Measure(new Size(width, double.PositiveInfinity));
        panel.Arrange(new Rect(0, 0, width, panel.DesiredSize.Height));
    }
}