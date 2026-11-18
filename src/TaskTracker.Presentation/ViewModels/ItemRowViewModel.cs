using System.Collections.ObjectModel;
using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core.Items;
using TaskTracker.Core.Urgency;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>One item row and its open and finished children.</summary>
public sealed class ItemRowViewModel : ViewModelBase
{
    private readonly ProjectWorkspaceViewModel workspace;
    private bool isExpanded;
    private bool isCompletedExpanded;
    private bool isSelected;
    private Urgency urgency;
    private string? sourceTitle;

    public ItemRowViewModel(ItemNode node, ProjectWorkspaceViewModel workspace)
    {
        Node = node;
        urgency = node.DisplayedUrgency.Value;
        this.workspace = workspace;
        PushBackCommand = new AsyncRelayCommand(() => workspace.PushBackAsync(this), () => PushBackReason is null);
        ToggleCommand = new AsyncRelayCommand(() => workspace.ToggleAsync(this));
        SkipRepeatCommand = new AsyncRelayCommand(() => workspace.ChangeRepeatAsync(this, skip: true));
        StopRepeatingCommand = new AsyncRelayCommand(() => workspace.ChangeRepeatAsync(this, skip: false));
        SelectCommand = new AsyncRelayCommand(() => workspace.SelectItemAsync(this));
        MoveItemToAreaCommand = new AsyncRelayCommand(() => workspace.MoveRowToAreaAsync(this));
        ToggleCurrentCommand = new AsyncRelayCommand(() => workspace.ToggleCurrentAsync(this));
    }

    public ItemNode Node { get; }

    public Guid Id => Node.Item.Id;

    /// <summary>Whether this is the item the tray card shows (§7.17).</summary>
    public bool IsCurrent => workspace.CurrentItemId == Id;

    /// <summary>The row menu entry that makes this item current, or clears it.</summary>
    public string CurrentMenuHeader => IsCurrent ? "Clear current item" : "Set as current item";

    /// <summary>Makes this item current, or clears it when it already is.</summary>
    public ICommand ToggleCurrentCommand { get; }

    internal void RaiseCurrentChanged()
    {
        OnPropertyChanged(nameof(IsCurrent));
        OnPropertyChanged(nameof(CurrentMenuHeader));
    }

    public ICommand MoveItemToAreaCommand { get; }

    public ICommand SkipRepeatCommand { get; }

    public ICommand PushBackCommand { get; }

    public string? StatusName { get; internal set; }

    public bool HasStatus => StatusName is not null;

    public IReadOnlyList<RowLookupChoice> StatusChoices { get; internal set; } = [];

    public IReadOnlyList<RowLookupChoice> PriorityChoices { get; internal set; } = [];

    public string? PushBackReason => PushBackOneDay.UnavailableReason(IsComplete,
        Node.Item.DueDate is not null || Node.Item.ScheduledStart is not null);

    public ICommand StopRepeatingCommand { get; }

    public bool Repeats => Node.Item.Recurrence is not null;

    public bool CanSkipRepeat => Repeats && !IsComplete;

    public string? RepeatSummary => Node.Item.Recurrence?.Describe();

    public Guid? ParentId => Node.Item.ParentItemId;

    public bool IsTopLevel => ParentId is null;

    public string Title => Node.Item.Title;

    public string? TicketNumber => Node.Item.TicketNumber;

    public bool IsComplete => Node.Item.CompletedAtUtc is not null;

    public bool IsFinished => Node.IsFinished;

    public Urgency Urgency
    {
        get => urgency;
        private set
        {
            if (SetProperty(ref urgency, value))
            {
                OnPropertyChanged(nameof(UrgencyLabel));
                OnPropertyChanged(nameof(IsOverdue));
                OnPropertyChanged(nameof(IsUrgent));
                OnPropertyChanged(nameof(IsApproaching));
                OnPropertyChanged(nameof(IsImmediate));
            }
        }
    }

    public string UrgencyLabel => Urgency == Urgency.None ? string.Empty : Urgency.ToString();

    public bool IsOverdue => Urgency == Urgency.Overdue;

    public bool IsUrgent => Urgency != Urgency.None;

    public bool IsApproaching => Urgency == Urgency.Approaching;

    public bool IsImmediate => Urgency is Urgency.Imminent or Urgency.Overdue;

    public string? SourceTitle
    {
        get => sourceTitle;
        set
        {
            if (SetProperty(ref sourceTitle, value))
            {
                OnPropertyChanged(nameof(HasSource));
            }
        }
    }

    public bool HasSource => SourceTitle is not null;

    public string? TypeName { get; set; }

    public string TypeIcon => TypeName switch
    {
        "Change" => "✎",
        "Error" => "!",
        "Discussion" => "☷",
        null => "•",
        _ => "◆"
    };

    public string? PriorityName { get; set; }

    public string Deadline => Node.Item.DueDate?.ToString("d") ?? Node.Item.ScheduledStart?.ToString("g") ?? string.Empty;

    public ObservableCollection<ItemRowViewModel> Children { get; } = [];

    public ObservableCollection<ItemRowViewModel> CompletedChildren { get; } = [];

    public int CompletedCount => CompletedChildren.Count;

    public bool HasOpenChildren => Children.Count > 0;

    public string CompletedLabel => $"{CompletedCount} completed";

    public bool HasCompletedChildren => CompletedCount > 0;

    public bool IsExpanded
    {
        get => isExpanded;
        set
        {
            if (SetProperty(ref isExpanded, value))
            {
                OnPropertyChanged(nameof(ExpanderGlyph));
            }
        }
    }

    public string ExpanderGlyph => IsExpanded ? "▾" : "▸";

    public bool IsCompletedExpanded
    {
        get => isCompletedExpanded;
        set => SetProperty(ref isCompletedExpanded, value);
    }

    public bool IsSelected
    {
        get => isSelected;
        set => SetProperty(ref isSelected, value);
    }

    public ICommand ToggleCommand { get; }

    public ICommand SelectCommand { get; }

    public void UpdateUrgency(Urgency value, string? source)
    {
        Urgency = value;
        SourceTitle = source;
    }

    /// <summary>Restores a checkbox after a completion action was canceled or blocked.</summary>
    public void RefreshCompletionState()
    {
        OnPropertyChanged(nameof(IsComplete));
    }
}