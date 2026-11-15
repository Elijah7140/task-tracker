using System.Collections.ObjectModel;
using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core.Items;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// The "Links" section of the item editor (§7.10): the draft list, the add and edit boxes and their validation.
/// The list is saved with the rest of the item, so changes here make the editor dirty like any other field.
/// </summary>
public sealed class ItemLinksViewModel : ViewModelBase
{
    private readonly IReadOnlyList<ItemLinkInput> stored;
    private string newUrl = string.Empty;
    private string newTitle = string.Empty;
    private string? error;
    private ItemLinkRowViewModel? editingRow;

    public ItemLinksViewModel(IEnumerable<ItemLink> links)
        : this(links.Select(link => new ItemLinkInput(link.Id, link.Url, link.Title)).ToList())
    {
    }

    public ItemLinksViewModel(IReadOnlyList<ItemLinkInput> inputs)
    {
        stored = inputs;
        SubmitCommand = new RelayCommand(Submit);
        CancelEditCommand = new RelayCommand(CancelEdit);

        foreach (var input in inputs)
        {
            Items.Add(new ItemLinkRowViewModel(input, this));
        }
    }

    /// <summary>The draft links in display order.</summary>
    public ObservableCollection<ItemLinkRowViewModel> Items { get; } = [];

    public bool HasItems
    {
        get { return Items.Count > 0; }
    }

    /// <summary>The address typed into the add box.</summary>
    public string NewUrl
    {
        get => newUrl;
        set => SetProperty(ref newUrl, value);
    }

    /// <summary>The optional title typed into the add box.</summary>
    public string NewTitle
    {
        get => newTitle;
        set => SetProperty(ref newTitle, value);
    }

    /// <summary>The validation message for the add box, or null.</summary>
    public string? Error
    {
        get => error;
        private set
        {
            if (SetProperty(ref error, value))
            {
                OnPropertyChanged(nameof(HasError));
            }
        }
    }

    public bool HasError
    {
        get { return Error is not null; }
    }

    public bool IsEditing
    {
        get { return editingRow is not null; }
    }

    /// <summary>"Update link" while a link is being edited, otherwise "Add link".</summary>
    public string SubmitText
    {
        get { return IsEditing ? "Update link" : "Add link"; }
    }

    /// <summary>Adds the typed link, or applies the edit to the link being edited.</summary>
    public ICommand SubmitCommand { get; }

    public ICommand CancelEditCommand { get; }

    /// <summary>True when the list differs from the stored one, or the add box holds something not yet added.</summary>
    public bool IsDirty
    {
        get { return HasPendingEntry() || !CurrentInputs().SequenceEqual(stored); }
    }

    /// <summary>The draft list as the service expects it.</summary>
    public IReadOnlyList<ItemLinkInput> CurrentInputs()
    {
        return Items.Select(row => row.ToInput()).ToList();
    }

    /// <summary>The whole list when it changed, or null when the stored links can stay as they are.</summary>
    public IReadOnlyList<ItemLinkInput>? ChangedInputs()
    {
        var current = CurrentInputs();
        return current.SequenceEqual(stored) ? null : current;
    }

    /// <summary>
    /// Adds whatever is typed in the add box so a Save does not silently drop it. Returns false, with
    /// <see cref="Error"/> set, when the typed link is not valid.
    /// </summary>
    public bool TryCommitPending()
    {
        if (!HasPendingEntry())
        {
            return true;
        }

        return TrySubmit();
    }

    /// <summary>Starts a fresh draft list from the stored links of a draft that is being thrown away.</summary>
    public static ItemLinksViewModel Reverted(ItemLinksViewModel discarded)
    {
        return new ItemLinksViewModel(discarded.stored);
    }

    internal void BeginEdit(ItemLinkRowViewModel row)
    {
        editingRow = row;
        NewUrl = row.Url;
        NewTitle = row.Title ?? string.Empty;
        Error = null;
        RaiseEditingChanged();
    }

    internal void Remove(ItemLinkRowViewModel row)
    {
        Items.Remove(row);

        if (ReferenceEquals(row, editingRow))
        {
            CancelEdit();
        }

        OnPropertyChanged(nameof(HasItems));
    }

    internal void Move(ItemLinkRowViewModel row, int offset)
    {
        var from = Items.IndexOf(row);
        var to = from + offset;

        if (from < 0 || to < 0 || to >= Items.Count)
        {
            return;
        }

        Items.Move(from, to);
    }

    private void Submit()
    {
        TrySubmit();
    }

    private bool TrySubmit()
    {
        var problem = FindProblem();

        if (problem is not null)
        {
            Error = problem;
            return false;
        }

        var input = new ItemLinkInput(editingRow?.Id, LinkPolicy.NormalizeUrl(NewUrl), LinkPolicy.NormalizeTitle(NewTitle));
        PlaceLink(new ItemLinkRowViewModel(input, this));
        ClearEntry();
        return true;
    }

    private string? FindProblem()
    {
        var problem = LinkPolicy.Validate(NewUrl, NewTitle);

        if (problem is null && editingRow is null && Items.Count >= LinkPolicy.MaxLinksPerItem)
        {
            return $"An item may have at most {LinkPolicy.MaxLinksPerItem} links.";
        }

        return problem;
    }

    private void PlaceLink(ItemLinkRowViewModel row)
    {
        if (editingRow is null)
        {
            Items.Add(row);
        }
        else
        {
            Items[Items.IndexOf(editingRow)] = row;
        }

        OnPropertyChanged(nameof(HasItems));
    }

    private void CancelEdit()
    {
        ClearEntry();
    }

    private void ClearEntry()
    {
        editingRow = null;
        NewUrl = string.Empty;
        NewTitle = string.Empty;
        Error = null;
        RaiseEditingChanged();
    }

    private void RaiseEditingChanged()
    {
        OnPropertyChanged(nameof(IsEditing));
        OnPropertyChanged(nameof(SubmitText));
    }

    private bool HasPendingEntry()
    {
        if (editingRow is not null)
        {
            return NewUrl.Trim() != editingRow.Url || LinkPolicy.NormalizeTitle(NewTitle) != editingRow.Title;
        }

        return !string.IsNullOrWhiteSpace(NewUrl) || !string.IsNullOrWhiteSpace(NewTitle);
    }
}