using System.Collections.ObjectModel;
using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core;
using TaskTracker.Core.Projects;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Displays a project folder tree and the selected area.</summary>
public sealed class ProjectWorkspaceViewModel : ViewModelBase
{
    private readonly Guid projectId;
    private readonly FolderService folders;
    private readonly ProjectService projects;
    private readonly IDialogService dialogs;
    private readonly INavigationService navigation;
    private FolderNodeViewModel? root;
    private FolderNodeViewModel? selectedFolder;

    public ProjectWorkspaceViewModel(Guid projectId, ProjectService projects, FolderService folders,
        IDialogService dialogs, INavigationService navigation)
    {
        this.projectId = projectId;
        this.folders = folders;
        this.projects = projects;
        this.dialogs = dialogs;
        this.navigation = navigation;
        HomeCommand = new AsyncRelayCommand(navigation.GoHomeAsync);
    }

    public ObservableCollection<FolderNodeViewModel> FolderRoots { get; } = [];

    public ObservableCollection<BreadcrumbViewModel> Breadcrumbs { get; } = [];

    public string ProjectName { get; private set; } = string.Empty;

    public string SelectedAreaName => selectedFolder?.Name ?? ProjectName;

    public FolderNodeViewModel? SelectedFolder => selectedFolder;

    public ICommand HomeCommand { get; }

    public async Task LoadAsync(Guid? selectedId = null)
    {
        var expandedIds = root is null
            ? new HashSet<Guid?>()
            : AllFolders(root).Where(node => node.IsExpanded).Select(node => node.Id).ToHashSet();
        ProjectWorkspaceSnapshot snapshot;

        try
        {
            snapshot = await projects.LoadWorkspaceAsync(projectId);
        }
        catch (DomainRuleException exception) when (root is not null)
        {
            await navigation.GoHomeAsync();
            await dialogs.ShowMessageAsync("Project unavailable", exception.Message);
            return;
        }
        ProjectName = snapshot.Name;
        OnPropertyChanged(nameof(ProjectName));
        root = new FolderNodeViewModel(null, ProjectName, null, this);
        BuildChildren(root, snapshot.Folders);

        if (expandedIds.Count > 0)
        {
            foreach (var node in AllFolders(root))
            {
                node.IsExpanded = expandedIds.Contains(node.Id);
            }
        }

        FolderRoots.Clear();
        FolderRoots.Add(root);
        Select(FindNode(root, selectedId ?? selectedFolder?.Id) ?? root);
    }

    public void Select(FolderNodeViewModel node)
    {
        if (selectedFolder is not null)
        {
            selectedFolder.IsSelected = false;
        }

        selectedFolder = node;
        node.IsSelected = true;
        OnPropertyChanged(nameof(SelectedFolder));
        OnPropertyChanged(nameof(SelectedAreaName));
        BuildBreadcrumbs(node);
    }

    public async Task CreateFolderAsync(FolderNodeViewModel parent)
    {
        var name = await dialogs.PromptAsync("New folder", "Folder name");

        if (name is not null)
        {
            parent.IsExpanded = true;
            await RunFolderActionAsync(() => folders.CreateAsync(projectId, parent.Id, name));
        }
    }

    public async Task RenameFolderAsync(FolderNodeViewModel node)
    {
        if (node.Id is not Guid id)
        {
            return;
        }

        var name = await dialogs.PromptAsync("Rename folder", "Folder name", node.Name);

        if (name is not null)
        {
            await RunFolderActionAsync(() => folders.RenameAsync(projectId, id, name));
        }
    }

    public async Task MoveFolderAsync(FolderNodeViewModel node)
    {
        if (node.Id is not Guid id || root is null)
        {
            return;
        }

        var choices = AllFolders(root)
            .Select(folder => new FolderChoice(folder.Id, folder.Name, folder.Depth))
            .ToArray();
        var destination = await dialogs.PickFolderAsync("Move folder", choices);

        if (destination is not null)
        {
            await RunFolderActionAsync(() => folders.MoveAsync(projectId, id, destination.Id));
        }
    }

    public async Task DeleteFolderAsync(FolderNodeViewModel node)
    {
        if (node.Id is not Guid id || !await dialogs.ConfirmAsync("Delete folder", $"Delete {node.Name} and its contents?"))
        {
            return;
        }

        var selectedId = IsAncestorOrSelf(node, selectedFolder) ? node.Parent?.Id : selectedFolder?.Id;
        await RunFolderActionAsync(() => folders.DeleteAsync(projectId, id), selectedId);
    }

    private async Task RunFolderActionAsync(Func<Task> action, Guid? selectedId = null)
    {
        try
        {
            await action();
            await LoadAsync(selectedId ?? selectedFolder?.Id);
        }
        catch (DomainRuleException exception)
        {
            await dialogs.ShowMessageAsync("Folder action failed", exception.Message);
        }
    }

    private void BuildChildren(FolderNodeViewModel parent, FolderTree tree)
    {
        foreach (var folder in tree.Children(parent.Id))
        {
            var child = new FolderNodeViewModel(folder.Id, folder.Name, parent, this);
            parent.Children.Add(child);
            BuildChildren(child, tree);
        }
    }

    private static bool IsAncestorOrSelf(FolderNodeViewModel ancestor, FolderNodeViewModel? node)
    {
        for (var current = node; current is not null; current = current.Parent)
        {
            if (current == ancestor)
            {
                return true;
            }
        }

        return false;
    }

    private static IEnumerable<FolderNodeViewModel> AllFolders(FolderNodeViewModel node)
    {
        yield return node;

        foreach (var child in node.Children)
        {
            foreach (var descendant in AllFolders(child))
            {
                yield return descendant;
            }
        }
    }

    private static FolderNodeViewModel? FindNode(FolderNodeViewModel node, Guid? id)
    {
        if (node.Id == id)
        {
            return node;
        }

        foreach (var child in node.Children)
        {
            var found = FindNode(child, id);

            if (found is not null)
            {
                return found;
            }
        }

        return null;
    }

    private void BuildBreadcrumbs(FolderNodeViewModel node)
    {
        Breadcrumbs.Clear();
        Breadcrumbs.Add(new BreadcrumbViewModel("Home", navigation.GoHomeAsync));
        var path = new Stack<FolderNodeViewModel>();

        for (var current = node; current is not null; current = current.Parent)
        {
            path.Push(current);
        }

        foreach (var segment in path)
        {
            var isCurrent = segment == node;
            Breadcrumbs.Add(new BreadcrumbViewModel(segment.Name, () =>
            {
                Select(segment);
                return Task.CompletedTask;
            }, isCurrent, true));
        }
    }
}