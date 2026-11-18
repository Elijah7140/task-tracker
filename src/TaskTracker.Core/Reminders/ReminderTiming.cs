using TaskTracker.Core.Items;
using TaskTracker.Core.Settings;
using TaskTracker.Core.Time;

namespace TaskTracker.Core.Reminders;

/// <summary>Validates reminder choices and resolves floating reminder times.</summary>
public static class ReminderTiming
{
    public static IReadOnlyList<int> Offsets { get; } =
        Array.AsReadOnly<int>([0, 5, 15, 30, 60, 120, 1440, 2880, 10080]);

    public static bool IsValid(ReminderMode? mode, int? minutes)
    {
        return mode switch
        {
            null or ReminderMode.None => minutes is null,
            ReminderMode.Offset => minutes is int value && Offsets.Contains(value),
            _ => false,
        };
    }

    /// <summary>Subtracts the offset in local time before resolving any gap or repeated hour.</summary>
    public static DateTime BaseInstant(DateOnly date, TimeOnly time, TimeSpan offset, TimeZoneInfo zone)
    {
        var due = date.ToDateTime(time);
        var local = new DateTime(Math.Max(0, due.Ticks - offset.Ticks));
        return FloatingTime.ToUtc(local, zone);
    }

    public static DateTime? BaseInstant(TodoItem item, EffectiveSettings settings, TimeZoneInfo zone)
    {
        if (item.CompletedAtUtc.HasValue || item.DeletedAtUtc.HasValue || item.DueDate is not { } date
            || !settings.RemindersEnabled.Value || item.ReminderMode == ReminderMode.None)
        {
            return null;
        }

        var time = item.DueTime ?? settings.DateOnlyReminderTime.Value;
        var offset = item.ReminderOffsetMinutes is int minutes
            ? TimeSpan.FromMinutes(minutes)
            : settings.DefaultReminderOffset.Value;
        return BaseInstant(date, time, offset, zone);
    }

    public static DateTime? Instant(TodoItem item, EffectiveSettings settings, TimeZoneInfo zone)
    {
        var original = BaseInstant(item, settings, zone);
        return original.HasValue && original == item.SnoozedForUtc ? item.SnoozedUntilUtc : original;
    }

    public static bool IsDue(DateTime instant, DateTime now, DateTime? deliveredFor)
    {
        return instant <= now && instant != deliveredFor;
    }
}