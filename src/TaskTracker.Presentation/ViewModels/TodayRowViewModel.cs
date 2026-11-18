using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core.Items;
using TaskTracker.Core.Today;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>A row in today's completion tree, including any ancestors needed for context.</summary>
public sealed class TodayRowViewModel : ViewModelBase
{
    private bool isExpanded;

    internal TodayRowViewModel(TodayItem item, TodayViewModel page, IReadOnlyList<TodayRowViewModel> children,
        bool expanded)
    {
        Item = item;
        Children = children;
        isExpanded = expanded;
        CompletedCount = (item.CompletedToday ? 1 : 0) + children.Sum(child => child.CompletedCount);
        OpenCommand = new AsyncRelayCommand(() => page.OpenAsync(item.Id));
        ReopenCommand = new AsyncRelayCommand(() => page.ReopenAsync(this), () => IsCompleted);
        PushBackCommand = new AsyncRelayCommand(() => page.PushBackAsync(item.Id), () => PushBackReason is null);
    }

    internal TodayItem Item { get; }

    public string Title => Item.Title;

    public bool IsCompleted => Item.IsCompleted;

    public bool HasChildren => Children.Count > 0;

    public string? StatusName { get; internal set; }

    public bool HasStatus => StatusName is not null;

    public IReadOnlyList<RowLookupChoice> StatusChoices { get; internal set; } = [];

    public IReadOnlyList<RowLookupChoice> PriorityChoices { get; internal set; } = [];

    public string? PushBackReason => PushBackOneDay.UnavailableReason(IsCompleted, Item.HasDates);

    public double Opacity => IsCompleted ? 1 : 0.65;

    public string? Status => Item switch
    {
        { IsCompleted: false } => "Not completed",
        { CompletedToday: false } => "Completed earlier",
        _ => null
    };

    public string ChildCount => $"{CompletedCount - (Item.CompletedToday ? 1 : 0)} completed";

    internal int CompletedCount { get; }

    public bool ShowChildCount => HasChildren && IsCompleted;

    public string ExpandLabel => IsExpanded ? "▾" : "▸";

    public IReadOnlyList<TodayRowViewModel> Children { get; }

    public ICommand OpenCommand { get; }

    public ICommand ReopenCommand { get; }

    public ICommand PushBackCommand { get; }

    public bool IsExpanded
    {
        get => isExpanded;
        set
        {
            if (SetProperty(ref isExpanded, value))
            {
                OnPropertyChanged(nameof(ExpandLabel));
            }
        }
    }

    internal void RestoreCheckBox()
    {
        OnPropertyChanged(nameof(IsCompleted));
    }
}