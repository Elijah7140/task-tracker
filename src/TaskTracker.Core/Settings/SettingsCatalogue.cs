namespace TaskTracker.Core.Settings;

/// <summary>Definitions for the v1 settings.</summary>
public static class SettingsCatalogue
{
    public static readonly SettingDefinition<bool> AutoCompleteParents =
        new("autoCompleteParents", true, true, new BoolCodec());

    public static readonly SettingDefinition<TimeSpan> UrgencyYellowThreshold =
        new("urgencyYellowThreshold", TimeSpan.FromDays(3), true, new DurationCodec());

    public static readonly SettingDefinition<TimeSpan> UrgencyRedThreshold =
        new("urgencyRedThreshold", TimeSpan.FromHours(24), true, new DurationCodec());
}