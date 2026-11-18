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
    private const string DateFormat = "yyyy-MM-dd";

    public async Task<IReadOnlyList<ReminderEntry>> DueAsync(DateTime now, TimeZoneInfo zone,
        DateTime? before, DateTime? since, int skip, CancellationToken cancellationToken)
    {
        RegisterClock(zone);
        var beforeTicks = before?.Ticks ?? long.MaxValue;
        var horizon = await HorizonAsync(now, zone, cancellationToken);
        return await database.Database
            .SqlQueryRaw<ReminderEntry>(DueSql, now.Ticks, beforeTicks, since?.Ticks ?? 0, BatchSize, skip, horizon)
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
        var horizon = await HorizonAsync(now, zone, cancellationToken);
        return await database.Database.SqlQueryRaw<ReminderEntry>(DeliveredSql, now.Ticks, ids, horizon)
            .ToListAsync(cancellationToken);
    }

    /// <summary>
    /// The latest due date that can have a reminder at or before <paramref name="now"/>: the local
    /// date plus the largest possible offset (the item maximum or any stored default), plus one
    /// day for time-zone and daylight-saving slack. Later items are skipped before resolving.
    /// </summary>
    private async Task<string> HorizonAsync(DateTime now, TimeZoneInfo zone, CancellationToken cancellationToken)
    {
        var largestOffset = await LargestOffsetAsync(cancellationToken);
        var localToday = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(now, zone));
        var days = (int)Math.Min(Math.Ceiling(largestOffset.TotalDays) + 1, DateOnly.MaxValue.DayNumber - localToday.DayNumber);
        return localToday.AddDays(days).ToString(DateFormat, CultureInfo.InvariantCulture);
    }

    private async Task<TimeSpan> LargestOffsetAsync(CancellationToken cancellationToken)
    {
        var definition = SettingsCatalogue.DefaultReminderOffset;
        var global = await database.GlobalSettings.Where(row => row.Key == definition.Key)
            .Select(row => row.Value).ToListAsync(cancellationToken);
        var projects = await database.ProjectSettings.Where(row => row.Key == definition.Key)
            .Select(row => row.Value).ToListAsync(cancellationToken);
        var itemMaximum = TimeSpan.FromMinutes(ReminderTiming.Offsets.Max());
        var stored = global.Concat(projects).Select(text => ParseOrDefault(definition, text));
        return stored.Append(definition.DefaultValue).Append(itemMaximum).Max();
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
        var due = DateOnly.ParseExact(date, DateFormat, CultureInfo.InvariantCulture);
        var localTime = ParseOrDefault(SettingsCatalogue.DateOnlyReminderTime, time);
        var offset = minutes.HasValue
            ? TimeSpan.FromMinutes(minutes.Value)
            : ParseOrDefault(SettingsCatalogue.DefaultReminderOffset, duration);
        return ReminderTiming.BaseInstant(due, localTime, offset, zone).Ticks;
    }

    /// <summary>A malformed stored setting falls back to its default for that row instead of stopping every reminder.</summary>
    private static T ParseOrDefault<T>(SettingDefinition<T> definition, string text)
    {
        try
        {
            return definition.Parse(text);
        }
        catch (Exception exception) when (exception is FormatException or OverflowException)
        {
            return definition.DefaultValue;
        }
    }

    /// <param name="itemFilter">Extra SQL appended to the item filter.</param>
    /// <param name="horizonParameter">The index of the parameter that holds the due-date horizon.</param>
    private static string ReminderInstantsSql(string itemFilter, int horizonParameter)
    {
        return $$"""
        WITH eligible AS MATERIALIZED (
            SELECT t.Id AS ItemId, t.Title, p.Name AS ProjectName, t.ReminderDeliveredFor,
                t.SnoozedForUtc, t.SnoozedUntilUtc,
                tt_reminder_ticks(t.DueDate, COALESCE(t.DueTime, {{ReminderSql.Setting(SettingsCatalogue.DateOnlyReminderTime)}}),
                    t.ReminderOffsetMinutes, {{ReminderSql.Setting(SettingsCatalogue.DefaultReminderOffset)}}) AS BaseTicks
            FROM TodoItem t
            JOIN Project p ON p.Id = t.ProjectId AND p.DeletedAtUtc IS NULL
            WHERE t.DeletedAtUtc IS NULL AND t.DueDate <= {{{horizonParameter}}}
                AND {{ReminderSql.Eligible}} {{itemFilter}}
                AND (t.FolderId IS NULL OR EXISTS (SELECT 1 FROM Folder f WHERE f.Id = t.FolderId AND f.DeletedAtUtc IS NULL))
        ), reminders AS (
            SELECT ItemId, Title, ProjectName, ReminderDeliveredFor,
                CASE WHEN SnoozedForUtc = BaseTicks THEN SnoozedUntilUtc ELSE BaseTicks END AS InstantTicks
            FROM eligible
        )
        """;
    }

    private static readonly string DueSql = ReminderInstantsSql(string.Empty, horizonParameter: 5) + """

        SELECT ItemId, Title, ProjectName, InstantTicks
        FROM reminders
        WHERE InstantTicks <= {0} AND InstantTicks < {1} AND InstantTicks >= {2} AND ReminderDeliveredFor IS NOT InstantTicks
        ORDER BY InstantTicks DESC, ItemId
        LIMIT {3} OFFSET {4}
        """;

    private static readonly string DeliveredSql = ReminderInstantsSql(
        "AND t.Id IN (SELECT value FROM json_each({1}))", horizonParameter: 2) + """

        SELECT ItemId, Title, ProjectName, InstantTicks
        FROM reminders
        WHERE InstantTicks <= {0} AND ReminderDeliveredFor = InstantTicks
        ORDER BY InstantTicks DESC, ItemId
        """;
}