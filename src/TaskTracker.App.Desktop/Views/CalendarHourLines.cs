using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;

using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Views;

/// <summary>Draws hourly guides behind a day of timed entries.</summary>
public sealed class CalendarHourLines : Control
{
    private const int HoursPerDay = 24;

    public override void Render(DrawingContext context)
    {
        var pen = new Pen(Brushes.Gray, 0.5);

        for (var hour = 0; hour <= HoursPerDay; hour++)
        {
            var position = hour * CalendarMetrics.HourHeight;
            context.DrawLine(pen, new Point(0, position), new Point(Bounds.Width, position));
        }
    }
}