using System.Globalization;

using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core.Settings;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Edits reminder preferences as part of the containing settings draft.</summary>
public sealed partial class ReminderSettingsViewModel : ViewModelBase
{
    private ReminderPreferences inherited = new(SettingsCatalogue.RemindersEnabled.DefaultValue,
        SettingsCatalogue.DefaultReminderOffset.DefaultValue, SettingsCatalogue.DateOnlyReminderTime.DefaultValue);

    [ObservableProperty]
    private bool enabled;

    [ObservableProperty]
    private string offsetMinutes = "60";

    [ObservableProperty]
    private string dateOnlyTime = "09:00";

    [ObservableProperty]
    private bool keepRunningInTray;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(EnabledSource))]
    private bool overrideEnabled;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(OffsetSource))]
    private bool overrideOffset;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(TimeSource))]
    private bool overrideTime;

    public string EnabledSource => SourceText(OverrideEnabled);

    public string OffsetSource => SourceText(OverrideOffset);

    public string TimeSource => SourceText(OverrideTime);

    /// <summary>Returns a validation message for any setting that the form would save.</summary>
    public string? Error
    {
        get
        {
            if ((!IsProject || OverrideOffset) && ParseOffset() is null)
            {
                return "Enter a nonnegative number of minutes for the default reminder.";
            }

            if ((!IsProject || OverrideTime) && ParseTime() is null)
            {
                return "Enter the date-only reminder time in HH:mm format.";
            }

            return null;
        }
    }

    public bool IsProject { get; init; }

    public ReminderPreferences Preferences => new(
        !IsProject || OverrideEnabled ? Enabled : null,
        !IsProject || OverrideOffset ? ParseOffset() : null,
        !IsProject || OverrideTime ? ParseTime() : null,
        IsProject ? null : KeepRunningInTray);

    public async Task LoadGlobalAsync(SettingsService settings)
    {
        inherited = await ReadGlobalAsync(settings);
        Enabled = inherited.Enabled!.Value;
        OffsetMinutes = FormatOffset(inherited.Offset!.Value);
        DateOnlyTime = FormatTime(inherited.DateOnlyTime!.Value);
        KeepRunningInTray = await settings.GetGlobalAsync(SettingsCatalogue.KeepRunningInTray);
    }

    public async Task LoadProjectAsync(SettingsService settings, EffectiveSettings effective)
    {
        inherited = await ReadGlobalAsync(settings);
        OverrideEnabled = effective.RemindersEnabled.Source == SettingSource.Project;
        OverrideOffset = effective.DefaultReminderOffset.Source == SettingSource.Project;
        OverrideTime = effective.DateOnlyReminderTime.Source == SettingSource.Project;
        Enabled = effective.RemindersEnabled.Value;
        OffsetMinutes = FormatOffset(effective.DefaultReminderOffset.Value);
        DateOnlyTime = FormatTime(effective.DateOnlyReminderTime.Value);
    }

    partial void OnOverrideEnabledChanged(bool value)
    {
        if (!value)
        {
            Enabled = inherited.Enabled!.Value;
        }
    }

    partial void OnOverrideOffsetChanged(bool value)
    {
        if (!value)
        {
            OffsetMinutes = FormatOffset(inherited.Offset!.Value);
        }
    }

    partial void OnOverrideTimeChanged(bool value)
    {
        if (!value)
        {
            DateOnlyTime = FormatTime(inherited.DateOnlyTime!.Value);
        }
    }

    [RelayCommand]
    private void ResetEnabled()
    {
        OverrideEnabled = false;
    }

    [RelayCommand]
    private void ResetOffset()
    {
        OverrideOffset = false;
    }

    [RelayCommand]
    private void ResetTime()
    {
        OverrideTime = false;
    }

    private static string SourceText(bool isOverridden)
    {
        return isOverridden ? "Project override" : "Inherited from global";
    }

    private static async Task<ReminderPreferences> ReadGlobalAsync(SettingsService settings)
    {
        return new ReminderPreferences(
            await settings.GetGlobalAsync(SettingsCatalogue.RemindersEnabled),
            await settings.GetGlobalAsync(SettingsCatalogue.DefaultReminderOffset),
            await settings.GetGlobalAsync(SettingsCatalogue.DateOnlyReminderTime));
    }

    private TimeSpan? ParseOffset()
    {
        if (!decimal.TryParse(OffsetMinutes, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var minutes)
            || minutes < 0 || minutes > (decimal)long.MaxValue / TimeSpan.TicksPerMinute)
        {
            return null;
        }

        return TimeSpan.FromTicks((long)decimal.Round(minutes * TimeSpan.TicksPerMinute));
    }

    private TimeOnly? ParseTime()
    {
        try
        {
            return SettingsCatalogue.DateOnlyReminderTime.Parse(DateOnlyTime);
        }
        catch (FormatException)
        {
            return null;
        }
    }

    private static string FormatOffset(TimeSpan offset)
    {
        return ((decimal)offset.Ticks / TimeSpan.TicksPerMinute).ToString(CultureInfo.InvariantCulture);
    }

    private static string FormatTime(TimeOnly time)
    {
        return time.Ticks % TimeSpan.TicksPerMinute == 0
            ? time.ToString("HH:mm", CultureInfo.InvariantCulture)
            : SettingsCatalogue.DateOnlyReminderTime.Format(time);
    }
}