using TaskTracker.Core.Persistence;
using TaskTracker.Core.Settings;
using TaskTracker.Core.Urgency;

namespace TaskTracker.Core.Calendar;

/// <summary>Loads calendar data using a fresh unit of work per operation.</summary>
public sealed class CalendarService(IUnitOfWorkFactory factory) : ICalendarService
{
    /// <summary>
    /// Loads the entries of a date range and attaches each entry's effective urgency thresholds
    /// (global defaults with the project's overrides). The range must be at least one day long.
    /// </summary>
    public async Task<IReadOnlyList<CalendarEntry>> LoadAsync(
        CalendarQuery query, CancellationToken cancellationToken = default)
    {
        if (query.ToDateExclusive <= query.FromDate)
        {
            throw new ArgumentException("Calendar range must have a positive length.", nameof(query));
        }

        await using var unit = factory.Begin();
        var entries = await unit.Calendar.LoadAsync(query, cancellationToken);
        var global = await unit.Settings.GetGlobalAsync(cancellationToken);
        var settings = new Dictionary<Guid, EffectiveSettings>();

        foreach (var projectId in entries.Select(entry => entry.ProjectId).Distinct())
        {
            var project = await unit.Settings.GetProjectAsync(projectId, cancellationToken);
            settings[projectId] = SettingsResolver.Resolve(global, project);
        }

        return entries.Select(entry => WithThresholds(entry, settings[entry.ProjectId])).ToArray();
    }

    private static CalendarEntry WithThresholds(CalendarEntry entry, EffectiveSettings settings)
    {
        var thresholds = new UrgencyThresholds(
            settings.UrgencyYellowThreshold.Value,
            settings.UrgencyRedThreshold.Value);
        return entry with { Thresholds = thresholds };
    }
}