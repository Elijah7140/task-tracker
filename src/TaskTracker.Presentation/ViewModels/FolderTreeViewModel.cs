using System.Collections.ObjectModel;

using TaskTracker.Core;
using TaskTracker.Core.Projects;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Maintains workspace folder nodes, selection, and breadcrumb navigation.</summary>
public sealed class FolderTreeViewModel : ViewModelBase
{
    private readonly ProjectWorkspaceViewModel workspace;
    private readonly Guid projectId;
    private readonly FolderService folders;
    private readonly IDialogService dialogs;
    private FolderNodeViewModel? root;
    private FolderNodeViewModel? selected;
    private string projectName = string.Empty;

    public FolderTreeViewModel(ProjectWorkspaceViewModel workspace, Guid projectId,
        FolderService folders, IDialogService dialogs)
    {
        this.workspace = workspace;
        this.projectId = projectId;
        this.folders = folders;
        this.dialogs = dialogs;
    }

    public ObservableCollection<FolderNodeViewModel> Roots { get; } = [];

    public ObservableCollection<BreadcrumbViewModel> Breadcrumbs { get; } = [];

    public FolderNodeViewModel? Root => root;

    public FolderNodeViewModel? Selected => selected;

    public string SelectedAreaName => selected?.Name ?? projectName;

    public void Load(ProjectWorkspaceSnapshot snapshot, Guid? selectedId)
    {
        var expanded = root is null
            ? new HashSet<Guid?>()
            : AllFolders(root).Where(node => node.IsExpanded).Select(node => node.Id).ToHashSet();
        projectName = snapshot.Name;
        root = new FolderNodeViewModel(null, snapshot.Name, null, workspace);
        BuildChildren(root, snapshot.Folders);

        foreach (var node in AllFolders(root))
        {
            if (expanded.Count > 0)
            {
                node.IsExpanded = expanded.Contains(node.Id);
            }
        }

        Roots.Clear();
        Roots.Add(root);
        Select(FindNode(root, selectedId ?? selected?.Id) ?? root);
    }

    public void Select(FolderNodeViewModel node)
    {
        if (selected is not null)
        {
            selected.IsSelected = false;
        }

        selected = node;
        node.IsSelected = true;
        OnPropertyChanged(nameof(Selected));
        OnPropertyChanged(nameof(SelectedAreaName));
        BuildBreadcrumbs(node);
    }

    public IEnumerable<FolderNodeViewModel> AllFolders()
    {
        return root is null ? [] : AllFolders(root);
    }

    public async Task CreateAsync(FolderNodeViewModel parent)
    {
        if (!await workspace.ResolveDraftAsync())
        {
            return;
        }

        var name = await dialogs.PromptAsync("New folder", "Folder name");

        if (name is not null)
        {
            parent.IsExpanded = true;
            await RunActionAsync(() => folders.CreateAsync(projectId, parent.Id, name));
        }
    }

    public async Task RenameAsync(FolderNodeViewModel node)
    {
        if (node.Id is not Guid id || !await workspace.ResolveDraftAsync())
        {
            return;
        }

        var name = await dialogs.PromptAsync("Rename folder", "Folder name", node.Name);

        if (name is not null)
        {
            await RunActionAsync(() => folders.RenameAsync(projectId, id, name));
        }
    }

    public async Task MoveAsync(FolderNodeViewModel node)
    {
        if (node.Id is not Guid id || root is null || !await workspace.ResolveDraftAsync())
        {
            return;
        }

        var choices = AllFolders()
            .Select(folder => new FolderChoice(folder.Id, folder.Name, folder.Depth))
            .ToArray();
        var destination = await dialogs.PickFolderAsync("Move folder", choices);

        if (destination is not null)
        {
            await RunActionAsync(() => folders.MoveAsync(projectId, id, destination.Id));
        }
    }

    public async Task DeleteAsync(FolderNodeViewModel node)
    {
        if (node.Id is not Guid id || !await workspace.ResolveDraftAsync() ||
            !await dialogs.ConfirmAsync("Delete folder", $"Delete {node.Name} and its contents?", "Delete"))
        {
            return;
        }

        var selectedId = IsAncestorOrSelf(node, selected) ? node.Parent?.Id : selected?.Id;
        await RunActionAsync(() => folders.DeleteAsync(projectId, id), selectedId);
    }

    private async Task RunActionAsync(Func<Task> action, Guid? selectedId = null)
    {
        try
        {
            await action();
            await workspace.LoadAsync(selectedId ?? selected?.Id);
        }
        catch (DomainRuleException exception)
        {
            await dialogs.ShowMessageAsync("Folder action failed", exception.Message);
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

    private void BuildBreadcrumbs(FolderNodeViewModel node)
    {
        Breadcrumbs.Clear();
        Breadcrumbs.Add(new BreadcrumbViewModel("Home", workspace.GoHomeAsync));
        var path = new Stack<FolderNodeViewModel>();

        for (var current = node; current is not null; current = current.Parent)
        {
            path.Push(current);
        }

        foreach (var segment in path)
        {
            Breadcrumbs.Add(new BreadcrumbViewModel(segment.Name,
                () => workspace.SelectAreaAsync(segment), segment == node, true));
        }
    }

    private void BuildChildren(FolderNodeViewModel parent, FolderTree tree)
    {
        foreach (var folder in tree.Children(parent.Id))
        {
            var child = new FolderNodeViewModel(folder.Id, folder.Name, parent, workspace);
            parent.Children.Add(child);
            BuildChildren(child, tree);
        }
    }

    private static IEnumerable<FolderNodeViewModel> AllFolders(FolderNodeViewModel node)
    {
        yield return node;

        foreach (var child in node.Children.SelectMany(AllFolders))
        {
            yield return child;
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
}