using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core.Items;
using TaskTracker.Presentation.Markdown;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>The Markdown description preview and the Links section of the item editor (§7.10).</summary>
public sealed partial class ItemEditorViewModel
{
    private bool isPreviewing;
    private IReadOnlyList<MarkdownBlock> previewBlocks = [];
    private ICommand? showEditCommand;
    private ICommand? showPreviewCommand;

    /// <summary>The item's link list draft; replaced by <see cref="LoadLinks"/> once the stored links are read.</summary>
    public ItemLinksViewModel Links { get; private set; } = new(Array.Empty<ItemLinkInput>());

    /// <summary>True while the description is shown rendered and read-only instead of in the text box.</summary>
    public bool IsPreviewing
    {
        get => isPreviewing;
        private set
        {
            if (SetProperty(ref isPreviewing, value))
            {
                OnPropertyChanged(nameof(IsEditingDescription));
            }
        }
    }

    /// <summary>True while the description text box is shown.</summary>
    public bool IsEditingDescription
    {
        get { return !IsPreviewing; }
    }

    /// <summary>The description rendered for the preview; empty until the preview is shown.</summary>
    public IReadOnlyList<MarkdownBlock> PreviewBlocks
    {
        get => previewBlocks;
        private set => SetProperty(ref previewBlocks, value);
    }

    public ICommand ShowEditCommand
    {
        get { return showEditCommand ??= new RelayCommand(ShowEdit); }
    }

    public ICommand ShowPreviewCommand
    {
        get { return showPreviewCommand ??= new RelayCommand(ShowPreview); }
    }

    /// <summary>The whole link list when it changed since it was loaded, or null to leave the stored links alone.</summary>
    public IReadOnlyList<ItemLinkInput>? ChangedLinks
    {
        get { return Links.ChangedInputs(); }
    }

    /// <summary>Replaces the link draft with the item's stored links.</summary>
    public void LoadLinks(IEnumerable<ItemLink> links)
    {
        Links = new ItemLinksViewModel(links);
        OnPropertyChanged(nameof(Links));
    }

    /// <summary>Takes the stored links of a draft being discarded, dropping its unsaved link changes.</summary>
    public void TakeRevertedLinks(ItemEditorViewModel discarded)
    {
        Links = ItemLinksViewModel.Reverted(discarded.Links);
        OnPropertyChanged(nameof(Links));
    }

    private void ShowEdit()
    {
        IsPreviewing = false;
    }

    private void ShowPreview()
    {
        PreviewBlocks = MarkdownParser.Parse(Description);
        IsPreviewing = true;
    }
}