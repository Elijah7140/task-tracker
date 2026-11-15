namespace TaskTracker.Presentation.ViewModels;

/// <summary>What a planned calendar move changes.</summary>
public enum CalendarMoveKind
{
    /// <summary>Nothing to save: the entry stays where it is, or the drop is not allowed.</summary>
    None,

    /// <summary>The item's due date and time change.</summary>
    Due,

    /// <summary>The item's schedule moves.</summary>
    Schedule
}