using TaskTracker.Core.Reminders;
using TaskTracker.Core.Settings;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>Shares reminder eligibility and effective setting SQL between search and the scheduler.</summary>
internal static class ReminderSql
{
    public static string Eligible =>
        $"t.CompletedAtUtc IS NULL AND t.DueDate IS NOT NULL AND COALESCE(t.ReminderMode, 0) <> {(int)ReminderMode.None} "
        + $"AND lower(trim({Setting(SettingsCatalogue.RemindersEnabled)})) = 'true'";

    public static string Setting<T>(SettingDefinition<T> definition)
    {
        var key = definition.Key;
        var fallback = definition.Format(definition.DefaultValue);
        return $"COALESCE((SELECT Value FROM ProjectSetting WHERE ProjectId = t.ProjectId AND Key = '{key}'), "
            + $"(SELECT Value FROM GlobalSetting WHERE Key = '{key}'), '{fallback}')";
    }
}