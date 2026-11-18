using TaskTracker.Core.Persistence;
using TaskTracker.Core.Time;

namespace TaskTracker.Core.Today;

/// <summary>Reads the completion tree for the current local day.</summary>
public sealed class TodayService(IUnitOfWorkFactory unitOfWorkFactory, TimeProvider clock, TimeZoneInfo zone)
{
    /// <summary>The exclusive UTC end of the current local day.</summary>
    public DateTimeOffset NextMidnight => MidnightUtc(LocalDay.AddDays(1));

    /// <summary>The current date in the application's local time zone.</summary>
    public DateOnly LocalDay => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(), zone).DateTime);

    public Task<IReadOnlyList<TodayItem>> LoadAsync(CancellationToken cancellationToken = default)
    {
        return LoadForDayAsync(LocalDay, cancellationToken);
    }

    /// <summary>Reads a captured local day so the displayed date matches the query even across midnight.</summary>
    public async Task<IReadOnlyList<TodayItem>> LoadForDayAsync(DateOnly day, CancellationToken cancellationToken = default)
    {
        await using var work = unitOfWorkFactory.Begin();
        return await work.Today.LoadAsync(MidnightUtc(day), MidnightUtc(day.AddDays(1)), cancellationToken);
    }

    private DateTime MidnightUtc(DateOnly day)
    {
        return FloatingTime.ToUtc(day, TimeOnly.MinValue, zone);
    }
}