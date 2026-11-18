using TaskTracker.Core.Items;

namespace TaskTracker.Core.Reminders;

/// <summary>Reads one bounded batch of due reminders across active projects.</summary>
public interface IReminderRepository
{
    Task<IReadOnlyList<ReminderEntry>> DueAsync(DateTime now, TimeZoneInfo zone,
        DateTime? before, DateTime? since, int skip, CancellationToken cancellationToken);

    Task<IReadOnlyList<TodoItem>> LoadForDeliveryAsync(IReadOnlyCollection<Guid> itemIds, CancellationToken cancellationToken);

    Task<IReadOnlyList<ReminderEntry>> DeliveredAsync(DateTime now, TimeZoneInfo zone,
        IReadOnlyCollection<Guid> itemIds, CancellationToken cancellationToken);
}