namespace TaskTracker.App.Desktop.Views;

/// <summary>
/// The style class names that mark calendar drop areas in <c>CalendarView.axaml</c>. XAML can only
/// use the literals, so a headless test checks that every name here is still on a control.
/// </summary>
public static class CalendarDropAreas
{
    /// <summary>A day cell of the month view.</summary>
    public const string MonthCell = "monthCell";

    /// <summary>The all-day cell of one day in the week view.</summary>
    public const string AllDayCell = "allDayCell";

    /// <summary>The time-grid column of one day in the week view.</summary>
    public const string TimeColumn = "timeColumn";

    /// <summary>Added to the area the pointer is over while an entry is dragged.</summary>
    public const string DropTarget = "dropTarget";
}