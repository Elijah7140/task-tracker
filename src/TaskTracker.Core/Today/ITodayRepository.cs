namespace TaskTracker.Core.Today;

/// <summary>Reads completions within a UTC interval and the ancestors needed to display them.</summary>
public interface ITodayRepository
{
    Task<IReadOnlyList<TodayItem>> LoadAsync(DateTime startUtc, DateTime endUtc, CancellationToken cancellationToken);
}