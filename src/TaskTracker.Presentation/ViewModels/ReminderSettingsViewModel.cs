using System.Globalization;

using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core.Reminders;
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
    private IReadOnlyList<ReminderChoice> offsetChoices = ReminderChoice.OffsetOptions;

    [ObservableProperty]
    private ReminderChoice? selectedOffset;

    [ObservableProperty]
    private TimeSpan? dateOnlyTime = SettingsCatalogue.DateOnlyReminderTime.DefaultValue.ToTimeSpan();

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
            if ((!IsProject || OverrideOffset) && SelectedOffset?.Offset is null)
            {
                return "Choose a default reminder offset.";
            }

            if ((!IsProject || OverrideTime) && DateOnlyTime is null)
            {
                return "Choose the date-only reminder time.";
            }

            return null;
        }
    }

    public bool IsProject { get; init; }

    public ReminderPreferences Preferences => new(
        !IsProject || OverrideEnabled ? Enabled : null,
        !IsProject || OverrideOffset ? SelectedOffset?.Offset : null,
        (!IsProject || OverrideTime) && DateOnlyTime is TimeSpan time ? TimeOnly.FromTimeSpan(time) : null,
        IsProject ? null : KeepRunningInTray);

    public async Task LoadGlobalAsync(SettingsService settings)
    {
        inherited = await ReadGlobalAsync(settings);
        Enabled = inherited.Enabled!.Value;
        LoadOffset(inherited.Offset!.Value);
        DateOnlyTime = inherited.DateOnlyTime!.Value.ToTimeSpan();
        KeepRunningInTray = await settings.GetGlobalAsync(SettingsCatalogue.KeepRunningInTray);
    }

    public async Task LoadProjectAsync(SettingsService settings, EffectiveSettings effective)
    {
        inherited = await ReadGlobalAsync(settings);
        OverrideEnabled = effective.RemindersEnabled.Source == SettingSource.Project;
        OverrideOffset = effective.DefaultReminderOffset.Source == SettingSource.Project;
        OverrideTime = effective.DateOnlyReminderTime.Source == SettingSource.Project;
        Enabled = effective.RemindersEnabled.Value;
        LoadOffset(effective.DefaultReminderOffset.Value);
        DateOnlyTime = effective.DateOnlyReminderTime.Value.ToTimeSpan();
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
            LoadOffset(inherited.Offset!.Value);
        }
    }

    partial void OnOverrideTimeChanged(bool value)
    {
        if (!value)
        {
            DateOnlyTime = inherited.DateOnlyTime!.Value.ToTimeSpan();
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

    private void LoadOffset(TimeSpan offset)
    {
        var standard = ReminderChoice.OffsetOptions.FirstOrDefault(choice => choice.Offset == offset);
        if (standard is not null)
        {
            OffsetChoices = ReminderChoice.OffsetOptions;
            SelectedOffset = standard;
            return;
        }

        var minutes = (decimal)offset.Ticks / TimeSpan.TicksPerMinute;
        var unit = minutes == 1 ? "minute" : "minutes";
        var custom = new ReminderChoice($"{minutes.ToString(CultureInfo.InvariantCulture)} {unit} before",
            ReminderMode.Offset, offset);
        OffsetChoices = [.. ReminderChoice.OffsetOptions, custom];
        SelectedOffset = custom;
    }
}