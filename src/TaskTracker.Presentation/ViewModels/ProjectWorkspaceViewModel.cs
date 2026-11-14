using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core;
using TaskTracker.Core.Completion;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Displays a project folder tree and the selected area.</summary>
public sealed class ProjectWorkspaceViewModel : ViewModelBase, IDisposable
{
    private readonly Guid projectId;
    private readonly ProjectService projects;
    private readonly IDialogService dialogs;
    private readonly INavigationService navigation;
    private readonly ItemService? items;
    private readonly ICustomFieldInputLoader? fieldLoader;
    private readonly AsyncRelayCommand saveCommand;
    private readonly WorkspaceUrgencyRefresher urgencyRefresher;
    private readonly ItemEditorCoordinator editorCoordinator;
    private readonly AreaItemsViewModel areaItems;
    private readonly FolderTreeViewModel folderTree;
    private ItemRowViewModel? selectedItem;
    private ItemEditorViewModel? editor;
    private AreaSnapshot? areaSnapshot;
    private string quickAddTitle = string.Empty;
    private bool isCompletedExpanded;
    private int selectionVersion;

    public ProjectWorkspaceViewModel(Guid projectId, ProjectService projects, FolderService folders,
        IDialogService dialogs, INavigationService navigation, ItemService? items = null,
        TimeProvider? clock = null, TimeZoneInfo? timeZone = null, IUiDispatcher? dispatcher = null,
        ICustomFieldInputLoader? fieldLoader = null)
    {
        this.projectId = projectId;
        this.projects = projects;
        this.dialogs = dialogs;
        this.navigation = navigation;
        this.items = items;
        this.fieldLoader = fieldLoader;
        areaItems = new AreaItemsViewModel(this, projectId, items, dialogs);
        folderTree = new FolderTreeViewModel(this, projectId, folders, dialogs);
        editorCoordinator = new ItemEditorCoordinator(dialogs);
        urgencyRefresher = new WorkspaceUrgencyRefresher(clock ?? TimeProvider.System,
            timeZone ?? TimeZoneInfo.Utc, RefreshUrgency,
            dispatcher ?? new SynchronizationContextDispatcher(SynchronizationContext.Current));
        HomeCommand = new AsyncRelayCommand(GoHomeAsync);
        SettingsCommand = new AsyncRelayCommand(OpenSettingsAsync);
        ProjectSettingsCommand = new AsyncRelayCommand(OpenProjectSettingsAsync);
        QuickAddCommand = new AsyncRelayCommand(QuickAddAsync);
        AddSubItemCommand = new AsyncRelayCommand(AddSubItemAsync);
        saveCommand = new AsyncRelayCommand(SaveFromCommandAsync, CanSave);
        RevertCommand = new RelayCommand(Revert);
        DeleteItemCommand = new AsyncRelayCommand(DeleteItemAsync);
        MoveUpCommand = new AsyncRelayCommand(() => ReorderSelectedAsync(-1));
        MoveDownCommand = new AsyncRelayCommand(() => ReorderSelectedAsync(1));
        ToggleSelectedCommand = new AsyncRelayCommand(ToggleSelectedAsync);
    }

    public ObservableCollection<FolderNodeViewModel> FolderRoots => folderTree.Roots;

    public ObservableCollection<BreadcrumbViewModel> Breadcrumbs => folderTree.Breadcrumbs;

    public string ProjectName { get; private set; } = string.Empty;

    public string SelectedAreaName => folderTree.SelectedAreaName;

    public FolderNodeViewModel? SelectedFolder => folderTree.Selected;

    internal ItemRowViewModel? SelectedItem => selectedItem;

    public ICommand HomeCommand { get; }

    public ICommand SettingsCommand { get; }

    public ICommand ProjectSettingsCommand { get; }

    public ObservableCollection<ItemRowViewModel> OpenItems => areaItems.OpenItems;

    public ObservableCollection<ItemRowViewModel> CompletedItems => areaItems.CompletedItems;

    public ObservableCollection<ItemType> ItemTypes { get; } = [];

    public ObservableCollection<LookupOption<ItemType>> TypeOptions { get; } = [];

    public ObservableCollection<PriorityLevel> PriorityLevels { get; } = [];

    public ObservableCollection<LookupOption<PriorityLevel>> PriorityOptions { get; } = [];

    public string CompletedLabel => $"Completed ({CompletedItems.Count})";

    /// <summary>False when the area has no finished items, so the empty Completed section is hidden.</summary>
    public bool HasCompletedItems => CompletedItems.Count > 0;

    public bool IsCompletedExpanded
    {
        get => isCompletedExpanded;
        set => SetProperty(ref isCompletedExpanded, value);
    }

    public string QuickAddTitle
    {
        get => quickAddTitle;
        set => SetProperty(ref quickAddTitle, value);
    }

    public ItemEditorViewModel? Editor
    {
        get => editor;
        private set
        {
            var previous = editor;

            if (SetProperty(ref editor, value))
            {
                ReplaceEditorSubscription(previous, value);
            }
        }
    }

    public bool HasEditor => Editor is not null;

    public IReadOnlyList<ItemRowViewModel> SelectedSubItems
    {
        get
        {
            if (selectedItem is null)
            {
                return [];
            }

            return [.. selectedItem.Children, .. selectedItem.CompletedChildren];
        }
    }

    public ICommand QuickAddCommand { get; }

    public ICommand AddSubItemCommand { get; }

    /// <summary>Saves the draft; disabled while a custom value cannot be parsed.</summary>
    public ICommand SaveCommand
    {
        get { return saveCommand; }
    }

    public ICommand RevertCommand { get; }

    public ICommand DeleteItemCommand { get; }

    public ICommand MoveUpCommand { get; }

    public ICommand MoveDownCommand { get; }

    public ICommand ToggleSelectedCommand { get; }

    public async Task GoHomeAsync()
    {
        if (await ResolveDraftAsync())
        {
            await navigation.GoHomeAsync();
        }
    }

    public async Task OpenSettingsAsync()
    {
        if (await ResolveDraftAsync())
        {
            await navigation.OpenAppSettingsAsync(projectId);
        }
    }

    public async Task OpenProjectSettingsAsync()
    {
        if (await ResolveDraftAsync())
        {
            await navigation.OpenProjectSettingsAsync(projectId);
        }
    }

    public void Dispose()
    {
        urgencyRefresher.Dispose();
    }

    /// <summary>Updates displayed row urgency using the Core roll-up.</summary>
    public void RefreshUrgency()
    {
        urgencyRefresher.Refresh(areaSnapshot, OpenItems.Concat(CompletedItems));
    }

    public async Task LoadAsync(Guid? selectedId = null)
    {
        if (folderTree.Root is not null && !await ResolveDraftAsync())
        {
            return;
        }

        ProjectWorkspaceSnapshot snapshot;

        try
        {
            snapshot = await projects.LoadWorkspaceAsync(projectId);
        }
        catch (DomainRuleException exception) when (folderTree.Root is not null)
        {
            await navigation.GoHomeAsync();
            await dialogs.ShowMessageAsync("Project unavailable", exception.Message);
            return;
        }
        ProjectName = snapshot.Name;
        OnPropertyChanged(nameof(ProjectName));
        folderTree.Load(snapshot, selectedId);
        OnPropertyChanged(nameof(SelectedFolder));
        OnPropertyChanged(nameof(SelectedAreaName));
        await LoadItemsAsync();
    }

    public void Select(FolderNodeViewModel node)
    {
        folderTree.Select(node);
        OnPropertyChanged(nameof(SelectedFolder));
        OnPropertyChanged(nameof(SelectedAreaName));
    }

    public async Task SelectAreaAsync(FolderNodeViewModel node)
    {
        if (!await ResolveDraftAsync())
        {
            node.IsSelected = false;
            if (SelectedFolder is not null)
            {
                SelectedFolder.IsSelected = true;
            }

            return;
        }

        Select(node);
        await LoadItemsAsync();
    }

    public async Task LoadItemsAsync(Guid? selectedItemId = null)
    {
        if (items is null)
        {
            return;
        }

        var snapshot = await items.LoadAreaAsync(projectId, SelectedFolder?.Id);
        areaSnapshot = snapshot;
        ItemTypes.Clear();
        PriorityLevels.Clear();
        TypeOptions.Clear();
        PriorityOptions.Clear();
        TypeOptions.Add(new LookupOption<ItemType>("None", null));
        PriorityOptions.Add(new LookupOption<PriorityLevel>("None", null));

        foreach (var type in snapshot.ItemTypes.Where(type => !type.IsArchived))
        {
            ItemTypes.Add(type);
            TypeOptions.Add(new LookupOption<ItemType>(type.Name, type));
        }

        foreach (var level in snapshot.PriorityLevels.Where(level => !level.IsArchived))
        {
            PriorityLevels.Add(level);
            PriorityOptions.Add(new LookupOption<PriorityLevel>(level.Name, level));
        }

        areaItems.Load(snapshot, this);
        OnPropertyChanged(nameof(CompletedLabel));
        OnPropertyChanged(nameof(HasCompletedItems));
        await SelectLoadedItemAsync(selectedItemId ?? selectedItem?.Id);
    }

    private IEnumerable<ItemRowViewModel> AllItems()
    {
        return areaItems.AllItems();
    }

    private async Task SelectLoadedItemAsync(Guid? id)
    {
        var row = AllItems().FirstOrDefault(candidate => candidate.Id == id);

        await SelectRowAsync(row);
    }

    public async Task SelectItemAsync(ItemRowViewModel row)
    {
        if (selectedItem?.Id == row.Id || !await ResolveDraftAsync())
        {
            return;
        }

        var current = AllItems().FirstOrDefault(item => item.Id == row.Id) ?? row;

        await SelectRowAsync(current);
    }

    /// <summary>
    /// Makes the row the selected item. The editor, including its custom fields, is built first
    /// and the selection changes in one step afterwards. If another selection started while the
    /// editor was loading, this result is stale and is dropped, so the latest selection wins.
    /// </summary>
    private async Task SelectRowAsync(ItemRowViewModel? row)
    {
        var version = ++selectionVersion;
        var draft = row is null ? null : await CreateEditorAsync(row);

        if (version != selectionVersion)
        {
            return;
        }

        if (selectedItem is not null)
        {
            selectedItem.IsSelected = false;
        }

        selectedItem = row;
        Editor = draft;
        OnPropertyChanged(nameof(HasEditor));
        OnPropertyChanged(nameof(SelectedSubItems));

        if (row is not null)
        {
            row.IsSelected = true;
        }
    }

    internal async Task<bool> ResolveDraftAsync()
    {
        return await editorCoordinator.ResolveAsync(Editor, selectedItem?.Node.Item, SaveAsync, Revert);
    }

    public async Task<bool> SaveAsync()
    {
        if (items is null || Editor is null)
        {
            return true;
        }

        if (!Editor.CustomFieldsValid)
        {
            await dialogs.ShowMessageAsync("Item validation", "Fix the custom field values marked in red first.");
            return false;
        }

        try
        {
            await items.EditAsync(Editor.Id, Editor.ToEdit(), Editor.ChangedCustomFields);
            await LoadItemsAsync(Editor.Id);
            return true;
        }
        catch (DomainRuleException exception)
        {
            await dialogs.ShowMessageAsync("Item validation", exception.Message);
            return false;
        }
    }

    /// <summary>Throws away the draft, custom values included, and shows the stored item again.</summary>
    public void Revert()
    {
        var previous = Editor;
        Editor = selectedItem is null ? null : CreateEditor(selectedItem);

        if (previous is not null && Editor is not null)
        {
            Editor.TakeRevertedCustomFields(previous);
        }
    }

    private async Task SaveFromCommandAsync()
    {
        await SaveAsync();
    }

    private bool CanSave()
    {
        return Editor is null || Editor.CustomFieldsValid;
    }

    private void ReplaceEditorSubscription(ItemEditorViewModel? previous, ItemEditorViewModel? current)
    {
        if (previous is not null)
        {
            previous.PropertyChanged -= OnEditorChanged;
        }

        if (current is not null)
        {
            current.PropertyChanged += OnEditorChanged;
        }

        saveCommand.NotifyCanExecuteChanged();
    }

    private void OnEditorChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(ItemEditorViewModel.CustomFieldsValid))
        {
            saveCommand.NotifyCanExecuteChanged();
        }
    }

    private async Task<ItemEditorViewModel> CreateEditorAsync(ItemRowViewModel row)
    {
        var draft = CreateEditor(row);

        if (fieldLoader is not null)
        {
            draft.LoadCustomFields(await fieldLoader.LoadAsync(projectId, draft.Id));
        }

        return draft;
    }

    private ItemEditorViewModel CreateEditor(ItemRowViewModel row)
    {
        var draft = editorCoordinator.Create(row, areaSnapshot);
        draft.InitializeOptions(TypeOptions, PriorityOptions);
        return draft;
    }

    public Task QuickAddAsync()
    {
        return areaItems.QuickAddAsync();
    }

    public Task AddSubItemAsync()
    {
        return areaItems.AddSubItemAsync();
    }

    public Task ToggleAsync(ItemRowViewModel row)
    {
        return areaItems.ToggleAsync(row);
    }

    public Task ToggleSelectedAsync()
    {
        return areaItems.ToggleSelectedAsync();
    }

    public Task DeleteItemAsync()
    {
        return areaItems.DeleteItemAsync();
    }

    public Task ReorderSelectedAsync(int offset)
    {
        return areaItems.ReorderSelectedAsync(offset);
    }
    public Task CreateFolderAsync(FolderNodeViewModel parent)
    {
        return folderTree.CreateAsync(parent);
    }

    public Task RenameFolderAsync(FolderNodeViewModel node)
    {
        return folderTree.RenameAsync(node);
    }

    public Task MoveFolderAsync(FolderNodeViewModel node)
    {
        return folderTree.MoveAsync(node);
    }

    public Task DeleteFolderAsync(FolderNodeViewModel node)
    {
        return folderTree.DeleteAsync(node);
    }
}