using System.Collections.ObjectModel;
using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>A folder tree node with selection, expansion, and context actions.</summary>
public sealed class FolderNodeViewModel : ViewModelBase
{
    private readonly ProjectWorkspaceViewModel workspace;
    private bool isExpanded = true;
    private bool isSelected;

    public FolderNodeViewModel(Guid? id, string name, FolderNodeViewModel? parent,
        ProjectWorkspaceViewModel workspace)
    {
        Id = id;
        Name = name;
        Parent = parent;
        this.workspace = workspace;
        SelectCommand = new RelayCommand(() => workspace.Select(this));
        NewFolderCommand = new AsyncRelayCommand(() => workspace.CreateFolderAsync(this));
        RenameCommand = new AsyncRelayCommand(() => workspace.RenameFolderAsync(this));
        MoveCommand = new AsyncRelayCommand(() => workspace.MoveFolderAsync(this));
        DeleteCommand = new AsyncRelayCommand(() => workspace.DeleteFolderAsync(this));
    }

    public Guid? Id { get; }

    public string Name { get; }

    public FolderNodeViewModel? Parent { get; }

    public ObservableCollection<FolderNodeViewModel> Children { get; } = [];

    public int Depth => Parent is null ? 0 : Parent.Depth + 1;

    public bool IsRoot => Id is null;

    public bool IsExpanded
    {
        get => isExpanded;
        set => SetProperty(ref isExpanded, value);
    }

    public bool IsSelected
    {
        get => isSelected;
        set
        {
            if (SetProperty(ref isSelected, value) && value && workspace.SelectedFolder != this)
            {
                workspace.Select(this);
            }
        }
    }

    public ICommand SelectCommand { get; }

    public ICommand NewFolderCommand { get; }

    public ICommand RenameCommand { get; }

    public ICommand MoveCommand { get; }

    public ICommand DeleteCommand { get; }

}