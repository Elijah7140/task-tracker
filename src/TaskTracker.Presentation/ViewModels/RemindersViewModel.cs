using System.Collections.ObjectModel;
using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core;
using TaskTracker.Core.Completion;
using TaskTracker.Core.Reminders;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Tracks session reminders and handles panel actions.</summary>
public sealed class RemindersViewModel : ViewModelBase
{
    private readonly ReminderService service;
    private readonly IDialogService dialogs;
    private readonly Func<Guid, Task<SearchOpenOutcome>> open;
    private readonly Func<Guid, Task<CompletionResult?>> complete;
    private readonly HashSet<Guid> knownItems = [];
    private bool isOpen;

    public RemindersViewModel(ReminderService service, IDialogService dialogs, Func<Guid, Task<SearchOpenOutcome>> open,
        Func<Guid, Task<CompletionResult?>> complete)
    {
        this.service = service;
        this.dialogs = dialogs;
        this.open = open;
        this.complete = complete;
        ToggleCommand = new RelayCommand(() => IsOpen = !IsOpen);
        Rows.CollectionChanged += (_, _) => NotifyCountChanged();
    }

    public ObservableCollection<ReminderRowViewModel> Rows { get; } = [];

    public int Count => Rows.Count;

    public bool HasReminders => Count > 0;

    public string BellName => HasReminders ? $"Reminders ({Count})" : "Reminders";

    public bool IsOpen
    {
        get => isOpen;
        set => SetProperty(ref isOpen, value);
    }

    public ICommand ToggleCommand { get; }

    public void Add(IReadOnlyList<ReminderEntry> entries)
    {
        foreach (var entry in entries.Reverse())
        {
            knownItems.Add(entry.ItemId);
            var existing = Rows.FirstOrDefault(row => row.Entry.ItemId == entry.ItemId);
            if (existing is not null)
            {
                Rows.Remove(existing);
            }

            Rows.Insert(0, new ReminderRowViewModel(entry, this));
        }
    }

    /// <summary>Removes stale entries and restores a reminder when its snooze is undone.</summary>
    public async Task RefreshAsync()
    {
        if (knownItems.Count == 0)
        {
            return;
        }

        var delivered = await service.DeliveredAsync(knownItems.ToArray());
        var current = delivered.ToDictionary(entry => entry.ItemId);
        foreach (var row in Rows.ToArray())
        {
            if (!current.TryGetValue(row.Entry.ItemId, out var active) || active != row.Entry)
            {
                Rows.Remove(row);
            }
        }

        var visible = Rows.Select(row => row.Entry.ItemId).ToHashSet();
        Add(delivered.Where(entry => knownItems.Contains(entry.ItemId) && !visible.Contains(entry.ItemId)).ToArray());
    }

    public async Task OpenAsync(Guid itemId)
    {
        await RunAsync(async () =>
        {
            var outcome = await open(itemId);
            if (outcome == SearchOpenOutcome.Opened)
            {
                IsOpen = false;
            }
            else if (outcome == SearchOpenOutcome.ItemMissing)
            {
                await dialogs.ShowMessageAsync("Reminder", "This item is no longer available.");
            }
        });
    }

    internal async Task CompleteAsync(ReminderRowViewModel row)
    {
        await RunAsync(async () =>
        {
            var result = await complete(row.Entry.ItemId);
            if (result is CompletionResult.Blocked blocked)
            {
                await dialogs.ShowMessageAsync("Cannot complete item", blocked.Reason);
            }
            else if (result is CompletionResult.Applied)
            {
                Dismiss(row);
            }
        });
    }

    internal Task SnoozeAsync(ReminderRowViewModel row, ReminderSnooze option)
    {
        return RunAsync(async () =>
        {
            await service.SnoozeAsync(row.Entry, option);
            Rows.Remove(row);
        });
    }

    internal void Dismiss(ReminderRowViewModel row)
    {
        knownItems.Remove(row.Entry.ItemId);
        Rows.Remove(row);
    }

    private void NotifyCountChanged()
    {
        OnPropertyChanged(nameof(Count));
        OnPropertyChanged(nameof(HasReminders));
        OnPropertyChanged(nameof(BellName));
    }

    private async Task RunAsync(Func<Task> operation)
    {
        try
        {
            await operation();
        }
        catch (DomainRuleException exception)
        {
            await dialogs.ShowMessageAsync("Reminder", exception.Message);
        }
    }
}