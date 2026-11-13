namespace TaskTracker.Core.Settings;

/// <summary>The effective values for one project.</summary>
public sealed record EffectiveSettings(
    EffectiveValue<bool> AutoCompleteParents,
    EffectiveValue<TimeSpan> UrgencyYellowThreshold,
    EffectiveValue<TimeSpan> UrgencyRedThreshold);