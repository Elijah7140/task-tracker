using TaskTracker.Core.Calendar;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>Records calendar moves instead of saving them, and can be told to fail or to hold a save open.</summary>
internal sealed class RecordingCalendarRescheduler : ICalendarRescheduler
{
    public List<DueMove> DueMoves { get; } = [];

    public List<ScheduleMove> ScheduleMoves { get; } = [];

    /// <summary>Thrown by every move when set.</summary>
    public Exception? Failure { get; set; }

    /// <summary>Runs after a move is recorded and before it completes, e.g. to change what the next load returns.</summary>
    public Action? AfterMove { get; set; }

    /// <summary>When set, every move stays in flight until this completes.</summary>
    public TaskCompletionSource? Hold { get; set; }

    public async Task MoveDueAsync(Guid itemId, DateOnly date, TimeOnly? time,
        CancellationToken cancellationToken = default)
    {
        ThrowIfFailing();
        DueMoves.Add(new DueMove(itemId, date, time));
        await WaitWhileHeldAsync();
        AfterMove?.Invoke();
    }

    public async Task MoveScheduleAsync(Guid itemId, DateTime newStart,
        CancellationToken cancellationToken = default)
    {
        ThrowIfFailing();
        ScheduleMoves.Add(new ScheduleMove(itemId, newStart));
        await WaitWhileHeldAsync();
        AfterMove?.Invoke();
    }

    private Task WaitWhileHeldAsync()
    {
        return Hold?.Task ?? Task.CompletedTask;
    }

    private void ThrowIfFailing()
    {
        if (Failure is not null)
        {
            throw Failure;
        }
    }

    internal sealed record DueMove(Guid ItemId, DateOnly Date, TimeOnly? Time);

    internal sealed record ScheduleMove(Guid ItemId, DateTime Start);
}