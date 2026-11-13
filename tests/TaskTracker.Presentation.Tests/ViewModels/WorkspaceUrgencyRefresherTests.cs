using Microsoft.Extensions.Time.Testing;

using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class WorkspaceUrgencyRefresherTests
{
    [Fact]
    public void Disposed_refresher_stops_timer_callbacks()
    {
        var clock = new FakeTimeProvider();
        var callbacks = 0;
        var refresher = new WorkspaceUrgencyRefresher(clock, TimeZoneInfo.Utc,
            () => callbacks++, new SynchronizationContextDispatcher(null));

        clock.Advance(TimeSpan.FromMinutes(1));
        refresher.Dispose();
        clock.Advance(TimeSpan.FromMinutes(5));

        Assert.Equal(1, callbacks);
    }
}