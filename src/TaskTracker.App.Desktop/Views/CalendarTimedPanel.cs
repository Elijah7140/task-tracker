using Avalonia;
using Avalonia.Controls;

using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Views;

/// <summary>
/// Positions timed entries within a day column drawn at <see cref="CalendarMetrics.HourHeight"/> pixels
/// per hour. Overlapping entries share the column width by their <c>LeftFraction</c> and <c>WidthFraction</c>.
/// </summary>
public sealed class CalendarTimedPanel : Panel
{
    private const double DefaultColumnWidth = 120;

    protected override Size MeasureOverride(Size availableSize)
    {
        var width = double.IsInfinity(availableSize.Width) ? DefaultColumnWidth : availableSize.Width;

        foreach (var child in Children)
        {
            child.Measure(EntrySize(child, width));
        }

        return new Size(width, CalendarMetrics.DayHeight);
    }

    protected override Size ArrangeOverride(Size finalSize)
    {
        foreach (var child in Children)
        {
            if (child.DataContext is not CalendarEntryViewModel entry)
            {
                continue;
            }

            var left = finalSize.Width * entry.LeftFraction;
            child.Arrange(new Rect(new Point(left, entry.Top), EntrySize(child, finalSize.Width)));
        }

        return finalSize;
    }

    /// <summary>The size an entry gets: its share of the column width and its own height.</summary>
    private static Size EntrySize(Control child, double columnWidth)
    {
        if (child.DataContext is not CalendarEntryViewModel entry)
        {
            return new Size(columnWidth, CalendarMetrics.DayHeight);
        }

        return new Size(columnWidth * entry.WidthFraction, entry.Height);
    }
}