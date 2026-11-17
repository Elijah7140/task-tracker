namespace TaskTracker.Core.Settings;

/// <summary>Reminder settings to save with the rest of a settings form. Null project values inherit.</summary>
public readonly record struct ReminderPreferences(bool? Enabled, TimeSpan? Offset, TimeOnly? DateOnlyTime, bool? KeepRunningInTray = null);