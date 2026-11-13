namespace TaskTracker.Core.Settings;

/// <summary>A resolved setting value with its source.</summary>
public sealed record EffectiveValue<T>(T Value, SettingSource Source);