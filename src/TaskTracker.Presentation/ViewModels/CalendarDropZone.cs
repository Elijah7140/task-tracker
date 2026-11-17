namespace TaskTracker.Presentation.ViewModels;

/// <summary>The kind of calendar area an entry is dropped on.</summary>
public enum CalendarDropZone
{
    /// <summary>A day cell of the month view; the entry keeps its time of day.</summary>
    MonthCell,

    /// <summary>The all-day row of the week view.</summary>
    AllDayRow,

    /// <summary>A day column of the week time grid; the entry takes the dropped time.</summary>
    TimeGrid
}