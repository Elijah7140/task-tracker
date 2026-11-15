namespace TaskTracker.Presentation.ViewModels;

/// <summary>The change a drop or key press asks for, ready to hand to the rescheduling service.</summary>
public sealed record CalendarMove
{
    private CalendarMove(CalendarMoveKind kind, DateOnly date, TimeOnly? time, DateTime start)
    {
        Kind = kind;
        Date = date;
        Time = time;
        Start = start;
    }

    /// <summary>The move that changes nothing.</summary>
    public static CalendarMove None { get; } = new(CalendarMoveKind.None, default, null, default);

    /// <summary>Which change this is: none, a new due date and time, or a new schedule start.</summary>
    public CalendarMoveKind Kind { get; }

    /// <summary>New due date; only meaningful for <see cref="CalendarMoveKind.Due"/>.</summary>
    public DateOnly Date { get; }

    /// <summary>New due time, or null for all day; only meaningful for <see cref="CalendarMoveKind.Due"/>.</summary>
    public TimeOnly? Time { get; }

    /// <summary>New schedule start; only meaningful for <see cref="CalendarMoveKind.Schedule"/>.</summary>
    public DateTime Start { get; }

    /// <summary>True when the move changes nothing and must not be saved.</summary>
    public bool IsNone => Kind == CalendarMoveKind.None;

    /// <summary>The day the entry lands on: the new due date, or the day the new schedule starts.</summary>
    public DateOnly TargetDay => Kind == CalendarMoveKind.Due ? Date : DateOnly.FromDateTime(Start);

    /// <summary>A move that sets the due date and time (null time means all day).</summary>
    public static CalendarMove ForDue(DateOnly date, TimeOnly? time)
    {
        return new CalendarMove(CalendarMoveKind.Due, date, time, default);
    }

    /// <summary>A move that starts the schedule at <paramref name="start"/>, keeping its length.</summary>
    public static CalendarMove ForSchedule(DateTime start)
    {
        return new CalendarMove(CalendarMoveKind.Schedule, default, null, start);
    }
}