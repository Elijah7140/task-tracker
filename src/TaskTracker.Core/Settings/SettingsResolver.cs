namespace TaskTracker.Core.Settings;

/// <summary>Resolves project overrides against global values and defaults.</summary>
public static class SettingsResolver
{
    /// <summary>Resolves all v1 settings for one project.</summary>
    public static EffectiveSettings Resolve(
        IReadOnlyDictionary<string, string> global,
        IReadOnlyDictionary<string, string> project)
    {
        return new EffectiveSettings(
            ResolveValue(SettingsCatalogue.AutoCompleteParents, global, project),
            ResolveValue(SettingsCatalogue.UrgencyYellowThreshold, global, project),
            ResolveValue(SettingsCatalogue.UrgencyRedThreshold, global, project))
        {
            RemindersEnabled = ResolveValue(SettingsCatalogue.RemindersEnabled, global, project),
            DefaultReminderOffset = ResolveValue(SettingsCatalogue.DefaultReminderOffset, global, project),
            DateOnlyReminderTime = ResolveValue(SettingsCatalogue.DateOnlyReminderTime, global, project),
            WorkspaceCardColumns = ResolveValue(SettingsCatalogue.WorkspaceCardColumns, global, project),
        };
    }

    /// <summary>Selects a project override when allowed, then global text, then the default.</summary>
    public static EffectiveValue<T> ResolveValue<T>(
        SettingDefinition<T> definition,
        IReadOnlyDictionary<string, string> global,
        IReadOnlyDictionary<string, string> project)
    {
        if (definition.ProjectOverridable && project.TryGetValue(definition.Key, out var overrideText))
        {
            return new EffectiveValue<T>(definition.Parse(overrideText), SettingSource.Project);
        }

        var value = global.TryGetValue(definition.Key, out var globalText)
            ? definition.Parse(globalText)
            : definition.DefaultValue;

        return new EffectiveValue<T>(value, SettingSource.Global);
    }

    public static bool HasValidThresholds(EffectiveSettings settings)
    {
        return settings.UrgencyRedThreshold.Value >= TimeSpan.Zero &&
            settings.UrgencyYellowThreshold.Value >= settings.UrgencyRedThreshold.Value;
    }
}