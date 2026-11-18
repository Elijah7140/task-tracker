namespace TaskTracker.Core.Settings;

/// <summary>The effective values for one project.</summary>
public sealed record EffectiveSettings(
    EffectiveValue<bool> AutoCompleteParents,
    EffectiveValue<TimeSpan> UrgencyYellowThreshold,
    EffectiveValue<TimeSpan> UrgencyRedThreshold)
{
    public EffectiveValue<bool> RemindersEnabled { get; init; } =
        new(SettingsCatalogue.RemindersEnabled.DefaultValue, SettingSource.Global);

    public EffectiveValue<TimeSpan> DefaultReminderOffset { get; init; } =
        new(SettingsCatalogue.DefaultReminderOffset.DefaultValue, SettingSource.Global);

    public EffectiveValue<TimeOnly> DateOnlyReminderTime { get; init; } =
        new(SettingsCatalogue.DateOnlyReminderTime.DefaultValue, SettingSource.Global);
}