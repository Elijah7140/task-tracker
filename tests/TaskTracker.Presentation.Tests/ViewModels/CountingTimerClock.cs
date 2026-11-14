using Microsoft.Extensions.Time.Testing;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>A fake clock that also counts timers created and not yet disposed.</summary>
internal sealed class CountingTimerClock : FakeTimeProvider
{
    public CountingTimerClock(DateTimeOffset start)
        : base(start)
    {
    }

    public int ActiveTimers { get; private set; }

    public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
    {
        ActiveTimers++;
        return new CountedTimer(base.CreateTimer(callback, state, dueTime, period), () => ActiveTimers--);
    }

    private sealed class CountedTimer(ITimer inner, Action onDisposed) : ITimer
    {
        private bool disposed;

        public bool Change(TimeSpan dueTime, TimeSpan period)
        {
            return inner.Change(dueTime, period);
        }

        public void Dispose()
        {
            if (!disposed)
            {
                disposed = true;
                onDisposed();
            }

            inner.Dispose();
        }

        public ValueTask DisposeAsync()
        {
            Dispose();
            return ValueTask.CompletedTask;
        }
    }
}