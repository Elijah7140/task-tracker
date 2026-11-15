using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core.Items;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>One link in the editor's Links list, with the commands of its row.</summary>
public sealed class ItemLinkRowViewModel
{
    public ItemLinkRowViewModel(ItemLinkInput input, ItemLinksViewModel owner)
    {
        Id = input.Id;
        Url = input.Url;
        Title = input.Title;
        EditCommand = new RelayCommand(() => owner.BeginEdit(this));
        RemoveCommand = new RelayCommand(() => owner.Remove(this));
        MoveUpCommand = new RelayCommand(() => owner.Move(this, -1));
        MoveDownCommand = new RelayCommand(() => owner.Move(this, 1));
    }

    /// <summary>Null for a link that has not been saved yet.</summary>
    public Guid? Id { get; }

    public string Url { get; }

    public string? Title { get; }

    /// <summary>The title when there is one, otherwise the address.</summary>
    public string DisplayText
    {
        get { return Title ?? Url; }
    }

    /// <summary>True when the title replaces the address, so the address is shown underneath it.</summary>
    public bool HasTitle
    {
        get { return Title is not null; }
    }

    public ICommand EditCommand { get; }

    public ICommand RemoveCommand { get; }

    public ICommand MoveUpCommand { get; }

    public ICommand MoveDownCommand { get; }

    public ItemLinkInput ToInput()
    {
        return new ItemLinkInput(Id, Url, Title);
    }
}