using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core.Reminders;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>One delivered reminder and the commands available in the panel.</summary>
public sealed class ReminderRowViewModel
{
    internal ReminderRowViewModel(ReminderEntry entry, RemindersViewModel panel)
    {
        Entry = entry;
        OpenCommand = new AsyncRelayCommand(() => panel.OpenAsync(entry.ItemId));
        CompleteCommand = new AsyncRelayCommand(() => panel.CompleteAsync(this));
        DismissCommand = new RelayCommand(() => panel.Dismiss(this));
        SnoozeTenMinutesCommand = new AsyncRelayCommand(() => panel.SnoozeAsync(this, ReminderSnooze.TenMinutes));
        SnoozeOneHourCommand = new AsyncRelayCommand(() => panel.SnoozeAsync(this, ReminderSnooze.OneHour));
        SnoozeTomorrowCommand = new AsyncRelayCommand(() => panel.SnoozeAsync(this, ReminderSnooze.Tomorrow));
    }

    public ReminderEntry Entry { get; }

    public ICommand OpenCommand { get; }

    public ICommand CompleteCommand { get; }

    public ICommand DismissCommand { get; }

    public ICommand SnoozeTenMinutesCommand { get; }

    public ICommand SnoozeOneHourCommand { get; }

    public ICommand SnoozeTomorrowCommand { get; }
}