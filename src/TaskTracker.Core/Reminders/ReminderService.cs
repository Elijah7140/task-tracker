using TaskTracker.Core.Fields;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Settings;
using TaskTracker.Core.Time;
using TaskTracker.Core.Undo;

namespace TaskTracker.Core.Reminders;

/// <summary>Reads due reminders and persists delivery or snooze through fresh units of work.</summary>
public sealed class ReminderService(IUnitOfWorkFactory factory, TimeProvider clock, TimeZoneInfo zone, FieldWriteGate? writeGate = null)
{
    private readonly FieldWriteGate gate = writeGate ?? FieldWriteGate.Shared;

    public Task<IReadOnlyList<ReminderEntry>> DueAsync(CancellationToken cancellationToken = default)
    {
        return DueAsync(clock.GetUtcNow().UtcDateTime, null, 0, cancellationToken);
    }

    public async Task<IReadOnlyList<ReminderEntry>> DueAsync(DateTime now, DateTime? before, int skip = 0,
        CancellationToken cancellationToken = default, DateTime? since = null)
    {
        await using var work = factory.Begin();
        return await work.Reminders.DueAsync(now, zone, before, since, skip, cancellationToken);
    }

    /// <summary>Checks which reminders already seen by this session still belong in the panel.</summary>
    public async Task<IReadOnlyList<ReminderEntry>> DeliveredAsync(IReadOnlyCollection<Guid> itemIds,
        CancellationToken cancellationToken = default)
    {
        await using var work = factory.Begin();
        return await work.Reminders.DeliveredAsync(clock.GetUtcNow().UtcDateTime, zone, itemIds, cancellationToken);
    }

    public async Task RecordDeliveryAsync(IReadOnlyList<ReminderEntry> entries,
        CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var work = factory.Begin();
        var instants = entries.ToDictionary(entry => entry.ItemId, entry => entry.InstantUtc);
        var items = await work.Reminders.LoadForDeliveryAsync(instants.Keys, cancellationToken);

        foreach (var item in items)
        {
            item.RecordReminderDelivery(instants[item.Id]);
        }

        await work.SaveChangesAsync(cancellationToken);
    }

    public async Task SnoozeAsync(ReminderEntry entry, ReminderSnooze option,
        CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var work = factory.Begin();
        var item = await work.Items.FindAsync(entry.ItemId, cancellationToken);
        if (item is null || await work.Projects.FindAsync(item.ProjectId, false, cancellationToken) is null)
        {
            throw new DomainRuleException("This item is no longer available.");
        }

        var global = await work.Settings.GetGlobalAsync(cancellationToken);
        var project = await work.Settings.GetProjectAsync(item.ProjectId, cancellationToken);
        var settings = SettingsResolver.Resolve(global, project);
        if (ReminderTiming.BaseInstant(item, settings, zone) is not { } original
            || ReminderTiming.Instant(item, settings, zone) != entry.InstantUtc
            || item.ReminderDeliveredFor != entry.InstantUtc)
        {
            throw new DomainRuleException("This reminder has changed.");
        }

        item.SnoozeReminder(original, SnoozedUntil(option, settings.DateOnlyReminderTime.Value));
        await work.SaveChangesAsync(UndoLabels.SnoozeReminder(item.Title), cancellationToken);
    }

    private DateTime SnoozedUntil(ReminderSnooze option, TimeOnly tomorrowTime)
    {
        var now = clock.GetUtcNow();
        return option switch
        {
            ReminderSnooze.TenMinutes => now.UtcDateTime.AddMinutes(10),
            ReminderSnooze.OneHour => now.UtcDateTime.AddHours(1),
            ReminderSnooze.Tomorrow => TomorrowAt(now, tomorrowTime),
            _ => throw new ArgumentOutOfRangeException(nameof(option)),
        };
    }

    private DateTime TomorrowAt(DateTimeOffset now, TimeOnly time)
    {
        var localToday = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, zone).DateTime);
        return FloatingTime.ToUtc(localToday.AddDays(1), time, zone);
    }
}