using System.Globalization;

using Avalonia;
using Avalonia.Controls;

using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Views;

/// <summary>
/// Shows where a dragged entry would land: a highlighted day cell or all-day row, or a ghost block
/// with its time in the week time grid.
/// </summary>
internal sealed class CalendarDropIndicator(Control weekColumns, Control ghost, TextBlock ghostLabel)
{
    private Control? highlightedCell;

    /// <summary>Highlights a month cell or the all-day cell of a week day.</summary>
    public void ShowCell(Control cell)
    {
        Clear();
        cell.Classes.Add(CalendarDropAreas.DropTarget);
        highlightedCell = cell;
    }

    /// <summary>
    /// Shows a ghost block of the given height at <paramref name="start"/> in a day column. The ghost
    /// is cut off at the end of the day so it never makes the scrolling grid taller.
    /// </summary>
    public void ShowGhost(Control column, TimeOnly start, double height)
    {
        Clear();
        var left = column.TranslatePoint(default, weekColumns)?.X ?? 0;
        var top = CalendarMetrics.OffsetOf(start);
        ghost.Width = column.Bounds.Width;
        ghost.Height = Math.Min(height, CalendarMetrics.DayHeight - top);
        ghost.Margin = new Thickness(left, top, 0, 0);
        ghostLabel.Text = start.ToString("HH:mm", CultureInfo.InvariantCulture);
        ghost.IsVisible = true;
    }

    /// <summary>Removes whichever indicator is showing.</summary>
    public void Clear()
    {
        highlightedCell?.Classes.Remove(CalendarDropAreas.DropTarget);
        highlightedCell = null;
        ghost.IsVisible = false;
    }
}