using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.VisualTree;

using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Views;

/// <summary>The calendar drop area under the pointer: its zone, its day, and the control that draws it.</summary>
internal sealed record CalendarDropHit(CalendarDropZone Zone, CalendarDayViewModel Day, Control Host)
{
    /// <summary>Finds the drop area under a point of <paramref name="view"/>, or null when there is none.</summary>
    public static CalendarDropHit? Find(Control view, Point point)
    {
        if (view.InputHitTest(point) is not Visual under)
        {
            return null;
        }

        foreach (var visual in under.GetSelfAndVisualAncestors())
        {
            var hit = FromControl(visual);

            if (hit is not null)
            {
                return hit;
            }
        }

        return null;
    }

    private static CalendarDropHit? FromControl(Visual visual)
    {
        if (visual is not Control { DataContext: CalendarDayViewModel day } control)
        {
            return null;
        }

        if (control.Classes.Contains(CalendarDropAreas.MonthCell))
        {
            return new CalendarDropHit(CalendarDropZone.MonthCell, day, control);
        }

        if (control.Classes.Contains(CalendarDropAreas.AllDayCell))
        {
            return new CalendarDropHit(CalendarDropZone.AllDayRow, day, control);
        }

        if (control.Classes.Contains(CalendarDropAreas.TimeColumn))
        {
            return new CalendarDropHit(CalendarDropZone.TimeGrid, day, control);
        }

        return null;
    }
}