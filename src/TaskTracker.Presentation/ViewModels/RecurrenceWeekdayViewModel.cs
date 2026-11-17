using TaskTracker.Core.Items.Recurrence;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>A weekly checkbox in the repeat editor.</summary>
public sealed class RecurrenceWeekdayViewModel(string label, RecurrenceWeekdays day, bool selected) : ViewModelBase
{
    private bool isSelected = selected;

    public string Label { get; } = label;

    public RecurrenceWeekdays Day { get; } = day;

    public string AutomationId => $"EditorRepeat{Day}";

    public bool IsSelected
    {
        get => isSelected;
        set => SetProperty(ref isSelected, value);
    }
}