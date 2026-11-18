using Avalonia;
using Avalonia.Controls;

namespace TaskTracker.App.Desktop.Views;

/// <summary>
/// Lays cards out in rows of equal-width columns. Every card in a row is as tall as the row's
/// tallest card, and never shorter than <see cref="MinRowHeight"/>. When the panel is too
/// narrow for <see cref="Columns"/> cards of <see cref="MinColumnWidth"/>, it uses fewer columns.
/// </summary>
public sealed class CardGridPanel : Panel
{
    public static readonly StyledProperty<int> ColumnsProperty =
        AvaloniaProperty.Register<CardGridPanel, int>(nameof(Columns), 4);

    public static readonly StyledProperty<double> MinColumnWidthProperty =
        AvaloniaProperty.Register<CardGridPanel, double>(nameof(MinColumnWidth), 220);

    public static readonly StyledProperty<double> MinRowHeightProperty =
        AvaloniaProperty.Register<CardGridPanel, double>(nameof(MinRowHeight));

    public static readonly StyledProperty<double> SpacingProperty =
        AvaloniaProperty.Register<CardGridPanel, double>(nameof(Spacing), 12);

    static CardGridPanel()
    {
        AffectsMeasure<CardGridPanel>(ColumnsProperty, MinColumnWidthProperty, MinRowHeightProperty, SpacingProperty);
    }

    /// <summary>The preferred number of cards per row (the "Cards per row" setting).</summary>
    public int Columns
    {
        get => GetValue(ColumnsProperty);
        set => SetValue(ColumnsProperty, value);
    }

    public double MinColumnWidth
    {
        get => GetValue(MinColumnWidthProperty);
        set => SetValue(MinColumnWidthProperty, value);
    }

    public double MinRowHeight
    {
        get => GetValue(MinRowHeightProperty);
        set => SetValue(MinRowHeightProperty, value);
    }

    /// <summary>The gap between columns and between rows.</summary>
    public double Spacing
    {
        get => GetValue(SpacingProperty);
        set => SetValue(SpacingProperty, value);
    }

    /// <summary>The number of columns actually used at a given width.</summary>
    public int ColumnsFor(double width)
    {
        var preferred = Math.Max(1, Columns);

        if (double.IsInfinity(width))
        {
            return preferred;
        }

        var fitting = (int)Math.Floor((width + Spacing) / (MinColumnWidth + Spacing));
        return Math.Clamp(fitting, 1, preferred);
    }

    protected override Size MeasureOverride(Size availableSize)
    {
        var columns = ColumnsFor(availableSize.Width);
        var cardWidth = CardWidth(availableSize.Width, columns);

        foreach (var child in Children)
        {
            child.Measure(new Size(cardWidth, double.PositiveInfinity));
        }

        var rowHeights = RowHeights(columns);
        var width = double.IsInfinity(availableSize.Width) ? columns * cardWidth + (columns - 1) * Spacing : availableSize.Width;

        return new Size(width, TotalHeight(rowHeights));
    }

    protected override Size ArrangeOverride(Size finalSize)
    {
        var columns = ColumnsFor(finalSize.Width);
        var cardWidth = CardWidth(finalSize.Width, columns);
        var rowHeights = RowHeights(columns);
        var top = 0.0;

        for (var row = 0; row < rowHeights.Count; row++)
        {
            ArrangeRow(row, columns, cardWidth, top, rowHeights[row]);
            top += rowHeights[row] + Spacing;
        }

        return finalSize;
    }

    private void ArrangeRow(int row, int columns, double cardWidth, double top, double height)
    {
        var visible = VisibleChildren();
        var first = row * columns;
        var last = Math.Min(first + columns, visible.Count);

        for (var index = first; index < last; index++)
        {
            var left = (index - first) * (cardWidth + Spacing);
            visible[index].Arrange(new Rect(left, top, cardWidth, height));
        }
    }

    private double CardWidth(double width, int columns)
    {
        if (double.IsInfinity(width))
        {
            return MinColumnWidth;
        }

        return Math.Max(0, (width - (columns - 1) * Spacing) / columns);
    }

    private List<double> RowHeights(int columns)
    {
        var visible = VisibleChildren();
        var heights = new List<double>();

        for (var first = 0; first < visible.Count; first += columns)
        {
            var tallest = visible.Skip(first).Take(columns).Max(child => child.DesiredSize.Height);
            heights.Add(Math.Max(tallest, MinRowHeight));
        }

        return heights;
    }

    private double TotalHeight(List<double> rowHeights)
    {
        return rowHeights.Count == 0 ? 0 : rowHeights.Sum() + (rowHeights.Count - 1) * Spacing;
    }

    private List<Control> VisibleChildren()
    {
        return Children.Where(child => child.IsVisible).ToList();
    }
}