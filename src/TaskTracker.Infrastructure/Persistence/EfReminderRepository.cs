using System.Globalization;
using System.Text.Json;

using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Items;
using TaskTracker.Core.Reminders;
using TaskTracker.Core.Settings;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>Resolves the floating reminder through a SQLite function and returns only a bounded batch.</summary>
internal sealed class EfReminderRepository(TaskTrackerDbContext database) : IReminderRepository
{
    private const int BatchSize = 100;

    public async Task<IReadOnlyList<ReminderEntry>> DueAsync(DateTime now, TimeZoneInfo zone,
        DateTime? before, DateTime? since, int skip, CancellationToken cancellationToken)
    {
        RegisterClock(zone);
        var beforeTicks = before?.Ticks ?? long.MaxValue;
        return await database.Database.SqlQueryRaw<ReminderEntry>(DueSql, now.Ticks, beforeTicks, since?.Ticks ?? 0, BatchSize, skip)
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<TodoItem>> LoadForDeliveryAsync(
        IReadOnlyCollection<Guid> itemIds, CancellationToken cancellationToken)
    {
        return await database.TodoItems.Where(item => itemIds.Contains(item.Id)).ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<ReminderEntry>> DeliveredAsync(DateTime now, TimeZoneInfo zone,
        IReadOnlyCollection<Guid> itemIds, CancellationToken cancellationToken)
    {
        RegisterClock(zone);
        var ids = JsonSerializer.Serialize(itemIds.Select(id => id.ToString().ToUpperInvariant()));
        return await database.Database.SqlQueryRaw<ReminderEntry>(DeliveredSql, now.Ticks, ids)
            .ToListAsync(cancellationToken);
    }

    private void RegisterClock(TimeZoneInfo zone)
    {
        var connection = (SqliteConnection)database.Database.GetDbConnection();
        connection.CreateFunction<string, string, int?, string, long>("tt_reminder_ticks",
            (date, time, minutes, duration) => Resolve(date, time, minutes, duration, zone),
            isDeterministic: true);
    }

    private static long Resolve(string date, string time, int? minutes, string duration, TimeZoneInfo zone)
    {
        var due = DateOnly.ParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture);
        var localTime = SettingsCatalogue.DateOnlyReminderTime.Parse(time);
        var offset = minutes.HasValue
            ? TimeSpan.FromMinutes(minutes.Value)
            : SettingsCatalogue.DefaultReminderOffset.Parse(duration);
        return ReminderTiming.BaseInstant(due, localTime, offset, zone).Ticks;
    }

    private static string ReminderInstantsSql(string itemFilter)
    {
        return $$"""
        WITH eligible AS MATERIALIZED (
            SELECT t.Id AS ItemId, t.Title, p.Name AS ProjectName, t.ReminderDeliveredFor,
                t.SnoozedForUtc, t.SnoozedUntilUtc,
                tt_reminder_ticks(t.DueDate, COALESCE(t.DueTime, {{ReminderSql.Setting(SettingsCatalogue.DateOnlyReminderTime)}}),
                    t.ReminderOffsetMinutes, {{ReminderSql.Setting(SettingsCatalogue.DefaultReminderOffset)}}) AS BaseTicks
            FROM TodoItem t
            JOIN Project p ON p.Id = t.ProjectId AND p.DeletedAtUtc IS NULL
            WHERE t.DeletedAtUtc IS NULL AND {{ReminderSql.Eligible}} {{itemFilter}}
                AND (t.FolderId IS NULL OR EXISTS (SELECT 1 FROM Folder f WHERE f.Id = t.FolderId AND f.DeletedAtUtc IS NULL))
        ), reminders AS (
            SELECT ItemId, Title, ProjectName, ReminderDeliveredFor,
                CASE WHEN SnoozedForUtc = BaseTicks THEN SnoozedUntilUtc ELSE BaseTicks END AS InstantTicks
            FROM eligible
        )
        """;
    }

    private static readonly string DueSql = ReminderInstantsSql(string.Empty) + """

        SELECT ItemId, Title, ProjectName, InstantTicks
        FROM reminders
        WHERE InstantTicks <= {0} AND InstantTicks < {1} AND InstantTicks >= {2} AND ReminderDeliveredFor IS NOT InstantTicks
        ORDER BY InstantTicks DESC, ItemId
        LIMIT {3} OFFSET {4}
        """;

    private static readonly string DeliveredSql = ReminderInstantsSql("AND t.Id IN (SELECT value FROM json_each({1}))") + """

        SELECT ItemId, Title, ProjectName, InstantTicks
        FROM reminders
        WHERE InstantTicks <= {0} AND ReminderDeliveredFor = InstantTicks
        ORDER BY InstantTicks DESC, ItemId
        """;
}