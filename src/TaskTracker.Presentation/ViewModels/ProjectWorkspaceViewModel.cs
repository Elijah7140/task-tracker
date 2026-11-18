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
public sealed class ProjectWorkspaceViewModel : ViewModelBase, IDisposable, IUnsavedChangesGuard
{
    private readonly Guid projectId;
    private readonly ProjectService projects;
    private readonly IDialogService dialogs;
    private readonly INavigationService navigation;
    private readonly ItemService? items;
    private readonly ICustomFieldInputLoader? fieldLoader;
    private readonly ILinkLauncher? linkLauncher;
    private readonly AsyncRelayCommand saveCommand;
    private readonly WorkspaceUrgencyRefresher urgencyRefresher;
    private readonly ItemEditorCoordinator editorCoordinator;
    private readonly AreaItemsViewModel areaItems;
    private readonly FolderTreeViewModel folderTree;
    private ItemRowViewModel? selectedItem;
    private ItemEditorViewModel? editor;
    private AreaSnapshot? areaSnapshot;
    private string quickAddTitle = string.Empty;
    private string? itemMoveError;
    private string? recurrenceStatus;
    private bool isCompletedExpanded;
    private int selectionVersion;
    private int areaVersion;
    private bool isMoveRunning;

    public ProjectWorkspaceViewModel(Guid projectId, ProjectService projects, FolderService folders,
        IDialogService dialogs, INavigationService navigation, ItemService? items = null,
        TimeProvider? clock = null, TimeZoneInfo? timeZone = null, IUiDispatcher? dispatcher = null,
        ICustomFieldInputLoader? fieldLoader = null, UndoCoordinator? undo = null,
        ILinkLauncher? linkLauncher = null)
    {
        this.projectId = projectId;
        this.projects = projects;
        this.dialogs = dialogs;
        this.navigation = navigation;
        this.items = items;
        this.fieldLoader = fieldLoader;
        this.linkLauncher = linkLauncher;
        Undo = undo;
        areaItems = new AreaItemsViewModel(this, projectId, items, dialogs);
        folderTree = new FolderTreeViewModel(this, projectId, folders, dialogs);
        editorCoordinator = new ItemEditorCoordinator(dialogs);
        urgencyRefresher = new WorkspaceUrgencyRefresher(clock ?? TimeProvider.System,
            timeZone ?? TimeZoneInfo.Utc, RefreshUrgency,
            dispatcher ?? new SynchronizationContextDispatcher(SynchronizationContext.Current));
        HomeCommand = new AsyncRelayCommand(GoHomeAsync);
        SettingsCommand = new AsyncRelayCommand(OpenSettingsAsync);
        SearchCommand = new AsyncRelayCommand(navigation.OpenSearchAsync);
        CalendarCommand = new AsyncRelayCommand(navigation.OpenCalendarAsync);
        TrashCommand = new AsyncRelayCommand(navigation.OpenTrashAsync);
        ProjectSettingsCommand = new AsyncRelayCommand(OpenProjectSettingsAsync);
        QuickAddCommand = new AsyncRelayCommand(QuickAddAsync);
        AddSubItemCommand = new AsyncRelayCommand(AddSubItemAsync);
        saveCommand = new AsyncRelayCommand(SaveFromCommandAsync, CanSave);
        RevertCommand = new RelayCommand(Revert);
        DeleteItemCommand = new AsyncRelayCommand(DeleteItemAsync);
        MoveUpCommand = new AsyncRelayCommand(() => ReorderSelectedAsync(-1));
        MoveDownCommand = new AsyncRelayCommand(() => ReorderSelectedAsync(1));
        IndentCommand = new AsyncRelayCommand(IndentSelectedAsync);
        OutdentCommand = new AsyncRelayCommand(OutdentSelectedAsync);
        MoveItemToAreaCommand = new AsyncRelayCommand(MoveSelectedToAreaAsync);
        ToggleSelectedCommand = new AsyncRelayCommand(ToggleSelectedAsync);
        SkipRepeatCommand = new AsyncRelayCommand(() => ChangeSelectedRepeatAsync(skip: true));
        StopRepeatingCommand = new AsyncRelayCommand(() => ChangeSelectedRepeatAsync(skip: false));
        OpenLinkCommand = new AsyncRelayCommand<string?>(OpenLinkAsync);
    }

    public ObservableCollection<FolderNodeViewModel> FolderRoots => folderTree.Roots;

    public ObservableCollection<BreadcrumbViewModel> Breadcrumbs => folderTree.Breadcrumbs;

    public string ProjectName { get; private set; } = string.Empty;

    public Guid ProjectId => projectId;

    public string SelectedAreaName => folderTree.SelectedAreaName;

    public FolderNodeViewModel? SelectedFolder => folderTree.Selected;

    internal ItemRowViewModel? SelectedItem => selectedItem;

    /// <summary>Pushes back the selected row when its dates can move.</summary>
    public ICommand? SelectedPushBackCommand => SelectedItem?.PushBackCommand;

    /// <summary>Whether the item editor has a draft that undo must preserve.</summary>
    public bool HasUnsavedChanges => EditorHasEdits();

    /// <summary>Undo and redo buttons and the status toast; null in a window that has no history.</summary>
    public UndoCoordinator? Undo { get; }

    public bool HasUndo => Undo is not null;

    public ICommand SkipRepeatCommand { get; }

    public ICommand StopRepeatingCommand { get; }

    public string? RecurrenceStatus
    {
        get => recurrenceStatus;
        private set
        {
            if (SetProperty(ref recurrenceStatus, value))
            {
                OnPropertyChanged(nameof(HasRecurrenceStatus));
            }
        }
    }

    public bool HasRecurrenceStatus => RecurrenceStatus is not null;

    internal void ReportLastRepeat()
    {
        Undo?.ClearStatus();
        RecurrenceStatus = "That was the last repeat.";
    }

    public ICommand HomeCommand { get; }

    public ICommand SettingsCommand { get; }

    public ICommand SearchCommand { get; }

    public ICommand CalendarCommand { get; }

    public ICommand TrashCommand { get; }

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

    public string? ItemMoveError
    {
        get => itemMoveError;
        private set
        {
            if (SetProperty(ref itemMoveError, value))
            {
                OnPropertyChanged(nameof(HasItemMoveError));
            }
        }
    }

    public bool HasItemMoveError => ItemMoveError is not null;

    /// <summary>Raised after a move reloads the item tree so the view can restore row focus.</summary>
    public event Action? ItemMoveCompleted;

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

    /// <summary>Opens a link address in the system browser or mail client; the parameter is the address.</summary>
    public ICommand OpenLinkCommand { get; }

    /// <summary>Saves the draft; disabled while a custom value cannot be parsed.</summary>
    public ICommand SaveCommand
    {
        get { return saveCommand; }
    }

    public ICommand RevertCommand { get; }

    public ICommand DeleteItemCommand { get; }

    public ICommand MoveUpCommand { get; }

    public ICommand MoveDownCommand { get; }

    public ICommand IndentCommand { get; }

    public ICommand OutdentCommand { get; }

    public ICommand MoveItemToAreaCommand { get; }

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

    /// <summary>
    /// Loads the project, selecting a folder and optionally an item that is revealed in the tree.
    /// Returns false when nothing was loaded: the user cancelled leaving an unsaved draft,
    /// or the project is gone and the shell went Home.
    /// </summary>
    public async Task<bool> LoadAsync(Guid? selectedFolderId = null, Guid? selectedItemId = null)
    {
        if (folderTree.Root is not null && !await ResolveDraftAsync())
        {
            return false;
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
            return false;
        }

        ProjectName = snapshot.Name;
        OnPropertyChanged(nameof(ProjectName));
        folderTree.Load(snapshot, selectedFolderId);
        areaVersion++;
        OnPropertyChanged(nameof(SelectedFolder));
        OnPropertyChanged(nameof(SelectedAreaName));
        await LoadItemsAsync(selectedItemId);
        RevealItem(selectedItemId);
        return true;
    }

    public void Select(FolderNodeViewModel node)
    {
        folderTree.Select(node);
        areaVersion++;
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

        RecurrenceStatus = null;
        var snapshot = await items.LoadAreaAsync(projectId, SelectedFolder?.Id);
        ApplyAreaSnapshot(snapshot);
        await SelectLoadedItemAsync(selectedItemId ?? selectedItem?.Id);
    }

    private void ApplyAreaSnapshot(AreaSnapshot snapshot)
    {
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
            PriorityOptions.Add(new LookupOption<PriorityLevel>(level.Label, level));
        }

        areaItems.Load(snapshot, this);
        OnPropertyChanged(nameof(CompletedLabel));
        OnPropertyChanged(nameof(HasCompletedItems));
    }

    /// <summary>Expands the ancestors of an item, and the Completed sections that hold it.</summary>
    private void RevealItem(Guid? itemId)
    {
        var row = FindRow(itemId);

        while (row is not null)
        {
            var parent = FindRow(row.ParentId);
            ExpandContainerOf(row, parent);
            row = parent;
        }
    }

    private void ExpandContainerOf(ItemRowViewModel row, ItemRowViewModel? parent)
    {
        if (parent is null)
        {
            IsCompletedExpanded |= CompletedItems.Contains(row);
            return;
        }

        parent.IsExpanded = true;
        parent.IsCompletedExpanded |= parent.CompletedChildren.Contains(row);
    }

    private ItemRowViewModel? FindRow(Guid? id)
    {
        return AllItems().FirstOrDefault(candidate => candidate.Id == id);
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

    /// <inheritdoc />
    public Task<bool> ConfirmLeaveAsync()
    {
        return ResolveDraftAsync();
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

        if (!Editor.Links.TryCommitPending())
        {
            await dialogs.ShowMessageAsync("Item validation", "Fix the link marked in red first.");
            return false;
        }

        try
        {
            var draft = Editor;
            if (!await SaveDraftAsync(items, draft))
            {
                return false;
            }

            await LoadItemsAsync(draft.Id);
            return true;
        }
        catch (DomainRuleException exception)
        {
            await dialogs.ShowMessageAsync("Item validation", exception.Message);
            return false;
        }
    }

    /// <summary>
    /// Saves the draft with any status change, asking first when a Done status would complete open
    /// sub-items. Returns false when the user cancels or reopening is blocked.
    /// </summary>
    private async Task<bool> SaveDraftAsync(ItemService service, ItemEditorViewModel draft)
    {
        var edit = draft.ToEdit();
        var values = draft.ChangedCustomFields;
        var links = draft.ChangedLinks;
        var statusChange = draft.StatusChange;
        var result = await ItemCompletion.ConfirmAsync(dialogs,
            confirmed => service.SaveEditorAsync(draft.Id, edit, values, links, statusChange, confirmed));
        await ItemLookupAction.ReportStatusResultAsync(dialogs, result);
        return result is CompletionResult.Applied;
    }

    /// <summary>Throws away the draft, custom values included, and shows the stored item again.</summary>
    public void Revert()
    {
        var previous = Editor;
        Editor = selectedItem is null ? null : CreateEditor(selectedItem);

        if (previous is not null && Editor is not null)
        {
            Editor.TakeRevertedCustomFields(previous);
            Editor.TakeRevertedLinks(previous);
        }
    }

    /// <summary>Hands a link to the system, but only if it is an http, https or mailto address (§7.10).</summary>
    public async Task OpenLinkAsync(string? url)
    {
        if (linkLauncher is null || !LinkPolicy.TryCreateUri(url, out var uri))
        {
            return;
        }

        if (!await linkLauncher.LaunchAsync(uri))
        {
            await dialogs.ShowMessageAsync("Open link", $"The link could not be opened: {url}");
        }
    }

    private async Task SaveFromCommandAsync()
    {
        await SaveAsync();
    }

    private bool CanSave()
    {
        return Editor is null || (Editor.CustomFieldsValid && !Editor.Repeat.HasError);
    }

    private void ReplaceEditorSubscription(ItemEditorViewModel? previous, ItemEditorViewModel? current)
    {
        if (previous is not null)
        {
            previous.PropertyChanged -= OnEditorChanged;
            previous.Repeat.PropertyChanged -= OnRepeatChanged;
        }

        if (current is not null)
        {
            current.PropertyChanged += OnEditorChanged;
            current.Repeat.PropertyChanged += OnRepeatChanged;
        }

        saveCommand.NotifyCanExecuteChanged();
    }

    private void OnRepeatChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(RecurrenceDraftViewModel.HasError))
        {
            saveCommand.NotifyCanExecuteChanged();
        }
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

        if (items is not null)
        {
            draft.LoadLinks(await items.LoadLinksAsync(draft.Id));
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

    private Task ChangeSelectedRepeatAsync(bool skip)
    {
        return selectedItem is { } row ? ChangeRepeatAsync(row, skip) : Task.CompletedTask;
    }

    internal Task PushBackAsync(ItemRowViewModel row)
    {
        return areaItems.PushBackAsync(row);
    }

    internal Task ChangeRepeatAsync(ItemRowViewModel row, bool skip)
    {
        return areaItems.ChangeRepeatAsync(row, skip);
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

    /// <summary>Places a dragged row before, after, or inside a row in the current area.</summary>
    public Task DropItemAsync(Guid sourceId, Guid targetId, ItemDropPosition position)
    {
        return RunItemMoveAsync(sourceId,
            (service, origin) => SaveDropAsync(service, origin, sourceId, targetId, position));
    }

    /// <summary>True when a drop at that row position would be accepted and change the order or parent.</summary>
    public bool CanDropItem(Guid sourceId, Guid targetId, ItemDropPosition position)
    {
        return ItemDropMapper.Map(AllItems().ToArray(), sourceId, targetId, position) is not null;
    }

    /// <summary>Promotes a dragged sub-item to the end of the area's top-level list.</summary>
    public Task DropItemAtRootEndAsync(Guid sourceId)
    {
        if (FindRow(sourceId) is not { ParentId: not null })
        {
            return Task.CompletedTask;
        }

        return RunItemMoveAsync(sourceId, (service, origin) => SaveRootEndDropAsync(service, origin, sourceId));
    }

    public async Task IndentSelectedAsync()
    {
        if (selectedItem is null)
        {
            return;
        }

        var id = selectedItem.Id;
        await RunItemMoveAsync(id, (service, origin) => SaveIndentAsync(service, origin, id));
    }

    public async Task OutdentSelectedAsync()
    {
        if (selectedItem is null)
        {
            return;
        }

        var id = selectedItem.Id;
        await RunItemMoveAsync(id, (service, origin) => SaveOutdentAsync(service, origin, id));
    }

    public async Task MoveSelectedToAreaAsync()
    {
        if (selectedItem is null || selectedItem.ParentId is not null)
        {
            return;
        }

        var choices = folderTree.AllFolders()
            .Select(folder => new FolderChoice(folder.Id, folder.Name, folder.Depth)).ToArray();
        var choice = await dialogs.PickFolderAsync("Move item to area", choices);

        if (choice is not null)
        {
            await DropItemOnFolderAsync(selectedItem.Id, choice.Id);
        }
    }

    public async Task MoveRowToAreaAsync(ItemRowViewModel row)
    {
        await SelectItemAsync(row);

        if (selectedItem?.Id == row.Id)
        {
            await MoveSelectedToAreaAsync();
        }
    }

    /// <summary>Moves a top-level row and its subtree to a folder in this project.</summary>
    public Task DropItemOnFolderAsync(Guid sourceId, Guid? targetFolderId)
    {
        if (FindRow(sourceId) is not { ParentId: null } || targetFolderId == SelectedFolder?.Id)
        {
            return Task.CompletedTask;
        }

        return RunGatedMoveAsync(
            (service, origin) => SaveAreaMoveAsync(service, origin, sourceId, targetFolderId));
    }

    private async Task<bool> SaveDropAsync(ItemService service, ItemMoveOrigin origin, Guid sourceId,
        Guid targetId, ItemDropPosition position)
    {
        var placement = ItemDropMapper.Map(AllItems().ToArray(), sourceId, targetId, position);

        if (placement is null)
        {
            return false;
        }

        await service.MoveAtAsync(projectId, origin.FolderId, sourceId,
            placement.Value.ParentId, placement.Value.Index);
        return true;
    }

    private async Task<bool> SaveRootEndDropAsync(ItemService service, ItemMoveOrigin origin, Guid sourceId)
    {
        var index = AllItems().Count(row => row.ParentId is null);
        await service.MoveAtAsync(projectId, origin.FolderId, sourceId, null, index);
        return true;
    }

    private async Task<bool> SaveIndentAsync(ItemService service, ItemMoveOrigin origin, Guid id)
    {
        await service.IndentAsync(projectId, origin.FolderId, id);
        return true;
    }

    private async Task<bool> SaveOutdentAsync(ItemService service, ItemMoveOrigin origin, Guid id)
    {
        await service.OutdentAsync(projectId, origin.FolderId, id);
        return true;
    }

    private async Task SaveAreaMoveAsync(ItemService service, ItemMoveOrigin origin, Guid sourceId,
        Guid? targetFolderId)
    {
        await service.MoveToAreaAsync(projectId, origin.FolderId, targetFolderId, sourceId);
        await ShowAreaMoveResultAsync(service, origin, sourceId, targetFolderId);
    }

    /// <summary>
    /// Runs one item move at a time. The unsaved-editor guard runs first; the origin (area,
    /// selection) is captured afterwards so the finished move can tell whether the user has
    /// moved on while the save was in flight.
    /// </summary>
    private async Task RunGatedMoveAsync(Func<ItemService, ItemMoveOrigin, Task> body)
    {
        if (items is null || isMoveRunning)
        {
            return;
        }

        isMoveRunning = true;
        ItemMoveOrigin? origin = null;

        try
        {
            if (await ResolveDraftAsync())
            {
                ItemMoveError = null;
                origin = CaptureMoveOrigin();
                await body(items, origin.Value);
            }
        }
        catch (DomainRuleException exception)
        {
            if (origin is ItemMoveOrigin started && CanShowMoveResult(started))
            {
                ItemMoveError = exception.Message;
            }
        }
        finally
        {
            isMoveRunning = false;
        }
    }

    private async Task RunItemMoveAsync(Guid movedId, Func<ItemService, ItemMoveOrigin, Task<bool>> saveMove)
    {
        await RunGatedMoveAsync(async (service, origin) =>
        {
            if (await saveMove(service, origin))
            {
                await ShowMoveResultAsync(service, origin, movedId);
            }
        });
    }

    private ItemMoveOrigin CaptureMoveOrigin()
    {
        return new ItemMoveOrigin(areaVersion, SelectedFolder?.Id, selectedItem?.Id, selectionVersion);
    }

    private bool IsStale(ItemMoveOrigin origin)
    {
        return origin.AreaVersion != areaVersion;
    }

    private bool CanShowMoveResult(ItemMoveOrigin origin)
    {
        return !IsStale(origin) && selectionVersion == origin.SelectionVersion && !EditorHasEdits();
    }

    /// <summary>Reloads the area after a move, unless the user has navigated elsewhere meanwhile.</summary>
    private async Task ShowMoveResultAsync(ItemService service, ItemMoveOrigin origin, Guid movedId)
    {
        var snapshot = await service.LoadAreaAsync(projectId, origin.FolderId);

        if (IsStale(origin))
        {
            return;
        }

        ApplyAreaSnapshot(snapshot);
        var selectedId = ChooseSelectionAfterMove(origin, movedId);
        var restoreRowFocus = selectedId == movedId && CanShowMoveResult(origin);
        await SelectAfterMoveAsync(selectedId, restoreRowFocus);
    }

    /// <summary>
    /// Follows a moved item into its new area, unless the user selected something else or
    /// started editing while the move was saving; then the current area is just refreshed.
    /// </summary>
    private async Task ShowAreaMoveResultAsync(ItemService service, ItemMoveOrigin origin, Guid movedId,
        Guid? targetFolderId)
    {
        var selectedId = ChooseSelectionAfterMove(origin, movedId);
        var followsMovedItem = selectedId == movedId;
        var versionBeforeLoad = selectionVersion;
        var shownFolderId = followsMovedItem ? targetFolderId : origin.FolderId;
        var snapshot = await service.LoadAreaAsync(projectId, shownFolderId);

        if (IsStale(origin) || versionBeforeLoad != selectionVersion)
        {
            return;
        }

        var restoreRowFocus = followsMovedItem && CanShowMoveResult(origin);

        if (followsMovedItem)
        {
            SelectFolderById(targetFolderId);
        }

        ApplyAreaSnapshot(snapshot);
        await SelectAfterMoveAsync(selectedId, restoreRowFocus);
    }

    private void SelectFolderById(Guid? folderId)
    {
        var folder = folderTree.AllFolders().FirstOrDefault(node => node.Id == folderId);

        if (folder is not null)
        {
            Select(folder);
        }
    }

    /// <summary>
    /// The moved item is selected, as it was before async moves, unless the user has since
    /// selected another item or typed into the editor; that newer state always wins.
    /// </summary>
    private Guid? ChooseSelectionAfterMove(ItemMoveOrigin origin, Guid movedId)
    {
        var currentId = selectedItem?.Id;

        if (selectionVersion != origin.SelectionVersion || EditorHasEdits())
        {
            return currentId;
        }

        return movedId;
    }

    private bool EditorHasEdits()
    {
        if (Editor is null || selectedItem is null)
        {
            return false;
        }

        try
        {
            return Editor.IsDirty(selectedItem.Node.Item);
        }
        catch (DomainRuleException)
        {
            return true;
        }
    }

    private async Task SelectAfterMoveAsync(Guid? itemId, bool restoreRowFocus)
    {
        RevealItem(itemId);
        var row = FindRow(itemId);

        if (row is not null && Editor?.Id == row.Id)
        {
            KeepEditorOn(row);
        }
        else
        {
            await SelectRowAsync(row);
        }

        if (restoreRowFocus)
        {
            ItemMoveCompleted?.Invoke();
        }
    }

    /// <summary>Points the selection at a reloaded row without replacing the editor's draft.</summary>
    private void KeepEditorOn(ItemRowViewModel row)
    {
        if (selectedItem is not null)
        {
            selectedItem.IsSelected = false;
        }

        selectedItem = row;
        row.IsSelected = true;
        OnPropertyChanged(nameof(SelectedSubItems));
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