using TaskTracker.Core.SavedSearches;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>One saved search in a list; <see cref="IsSelected"/> marks the one currently open.</summary>
public sealed class SavedSearchEntryViewModel : ViewModelBase
{
    private string name;
    private bool isSelected;

    public SavedSearchEntryViewModel(SavedSearch search)
    {
        Id = search.Id;
        name = search.Name;
    }

    public Guid Id { get; }

    public string Name
    {
        get => name;
        set => SetProperty(ref name, value);
    }

    public bool IsSelected
    {
        get => isSelected;
        set => SetProperty(ref isSelected, value);
    }
}