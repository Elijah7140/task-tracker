using TaskTracker.Core.Persistence;
using TaskTracker.Core.Time;

namespace TaskTracker.Core.Today;

/// <summary>Reads the completion tree for the current local day.</summary>
public sealed class TodayService(IUnitOfWorkFactory unitOfWorkFactory, TimeProvider clock, TimeZoneInfo zone)
{
    /// <summary>The exclusive UTC end of the current local day.</summary>
    public DateTimeOffset NextMidnight => MidnightUtc(LocalDay().AddDays(1));

    public async Task<IReadOnlyList<TodayItem>> LoadAsync(CancellationToken cancellationToken = default)
    {
        var day = LocalDay();
        await using var work = unitOfWorkFactory.Begin();
        return await work.Today.LoadAsync(MidnightUtc(day), MidnightUtc(day.AddDays(1)), cancellationToken);
    }

    private DateOnly LocalDay()
    {
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(), zone).DateTime);
    }

    private DateTime MidnightUtc(DateOnly day)
    {
        return FloatingTime.ToUtc(day, TimeOnly.MinValue, zone);
    }
}