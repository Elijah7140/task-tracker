using TaskTracker.Core.Settings;

namespace TaskTracker.Core.Transfer.Json;

/// <summary>Checks that the setting values in an import document can be read; unknown keys are ignored.</summary>
internal static class SettingsValidator
{
    public static void Validate(IReadOnlyDictionary<string, string>? settings, string path, IssueList issues)
    {
        if (settings is null)
        {
            return;
        }

        Check(SettingsCatalogue.AutoCompleteParents, settings, path, issues);
        Check(SettingsCatalogue.UrgencyYellowThreshold, settings, path, issues);
        Check(SettingsCatalogue.UrgencyRedThreshold, settings, path, issues);
        Check(SettingsCatalogue.RemindersEnabled, settings, path, issues);
        Check(SettingsCatalogue.DefaultReminderOffset, settings, path, issues);
        Check(SettingsCatalogue.DateOnlyReminderTime, settings, path, issues);
    }

    private static void Check<T>(SettingDefinition<T> definition, IReadOnlyDictionary<string, string> settings,
        string path, IssueList issues)
    {
        if (!settings.TryGetValue(definition.Key, out var text))
        {
            return;
        }

        try
        {
            definition.Parse(text);
        }
        catch (FormatException exception)
        {
            issues.Add($"{path}.{definition.Key}", exception.Message);
        }
    }
}