using TaskTracker.Core.Calendar;

namespace TaskTracker.App.Desktop.Tests;

/// <summary>
/// Wraps the real rescheduler. After <see cref="Hold"/>, every move waits (before it is saved) until
/// <see cref="Release"/>, so a test can press keys while a save is still pending.
/// </summary>
internal sealed class HeldCalendarRescheduler(ICalendarRescheduler inner) : ICalendarRescheduler
{
    private TaskCompletionSource? gate;

    /// <summary>The number of moves that reached the rescheduler.</summary>
    public int MovesStarted { get; private set; }

    public void Hold()
    {
        gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    }

    public void Release()
    {
        gate?.SetResult();
    }

    public async Task MoveDueAsync(Guid itemId, DateOnly date, TimeOnly? time,
        CancellationToken cancellationToken = default)
    {
        MovesStarted++;
        await WaitWhileHeldAsync();
        await inner.MoveDueAsync(itemId, date, time, cancellationToken);
    }

    public async Task MoveScheduleAsync(Guid itemId, DateTime newStart,
        CancellationToken cancellationToken = default)
    {
        MovesStarted++;
        await WaitWhileHeldAsync();
        await inner.MoveScheduleAsync(itemId, newStart, cancellationToken);
    }

    private Task WaitWhileHeldAsync()
    {
        return gate?.Task ?? Task.CompletedTask;
    }
}