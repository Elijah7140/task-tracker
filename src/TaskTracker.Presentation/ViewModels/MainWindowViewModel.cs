using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core;
using TaskTracker.Core.Calendar;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
using TaskTracker.Core.SavedSearches;
using TaskTracker.Core.Search;
using TaskTracker.Core.Search.Syntax;
using TaskTracker.Core.Settings;
using TaskTracker.Core.Trash;
using TaskTracker.Core.Undo;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Owns the current page and handles application navigation.</summary>
public sealed class MainWindowViewModel : ViewModelBase, INavigationService, IUndoHost
{
    private readonly ProjectService projectService;
    private readonly FolderService folderService;
    private readonly IDialogService dialogs;
    private readonly ItemService? itemService;
    private readonly TimeProvider? clock;
    private readonly TimeZoneInfo? timeZone;
    private readonly IUiDispatcher? dispatcher;
    private readonly SettingsService? settings;
    private readonly LookupService? lookups;
    private readonly FieldService? fields;
    private readonly ICustomFieldInputLoader? fieldLoader;
    private readonly IItemSearchService? search;
    private readonly IFieldRegistry? registry;
    private readonly CalendarService? calendar;
    private readonly ICalendarRescheduler? rescheduler;
    private readonly ITrashService? trash;
    private readonly SavedSearchService? savedSearches;
    private readonly ItemQueryParser? queryParser;
    private readonly TransferServices? transfer;
    private ViewModelBase? transientReturnPage;
    private bool returnPageIsStale;
    private bool isOpeningSearch;
    private bool isOpeningCalendar;
    private bool isOpeningTrash;
    private ViewModelBase? currentPage;
    private int pageVersion;

    public MainWindowViewModel(ProjectService projectService, FolderService folderService, IDialogService dialogs,
        ItemService? itemService = null, TimeProvider? clock = null, TimeZoneInfo? timeZone = null,
        IUiDispatcher? dispatcher = null, SettingsService? settings = null, LookupService? lookups = null,
        FieldService? fields = null, IItemSearchService? search = null, IFieldRegistry? registry = null,
        CalendarService? calendar = null, ICalendarRescheduler? rescheduler = null,
        ITrashService? trash = null, SavedSearchService? savedSearches = null, ItemQueryParser? queryParser = null,
        UndoHistory? undoHistory = null, TransferServices? transfer = null)
    {
        this.projectService = projectService;
        this.folderService = folderService;
        this.dialogs = dialogs;
        this.itemService = itemService;
        this.clock = clock;
        this.timeZone = timeZone;
        this.dispatcher = dispatcher;
        this.settings = settings;
        this.lookups = lookups;
        this.fields = fields;
        this.search = search;
        this.registry = registry;
        this.calendar = calendar;
        this.rescheduler = rescheduler;
        this.trash = trash;
        this.savedSearches = savedSearches;
        this.queryParser = queryParser;
        this.transfer = transfer;
        Undo = undoHistory is null ? null : new UndoCoordinator(undoHistory, this);
        fieldLoader = CreateFieldLoader(fields, itemService);
        SearchCommand = new AsyncRelayCommand(OpenSearchAsync);
        CalendarCommand = new AsyncRelayCommand(OpenCalendarAsync);
        TrashCommand = new AsyncRelayCommand(OpenTrashAsync);
    }

    public string Title => "Task Tracker";

    public ICommand SearchCommand { get; }

    public ICommand CalendarCommand { get; }

    public ICommand TrashCommand { get; }

    /// <summary>Undo and redo for the whole window; null when the shell was built without a history.</summary>
    public UndoCoordinator? Undo { get; }

    bool IUndoHost.HasUnsavedEdits => CurrentPage is ProjectWorkspaceViewModel { HasUnsavedChanges: true };

    /// <summary>
    /// Brings the screen on show up to date. A search, calendar or trash page also marks the page
    /// behind it out of date, so returning to it reloads it through the usual unsaved-changes guard.
    /// </summary>
    async Task IUndoHost.ReloadAsync()
    {
        if (IsTransientPage(CurrentPage))
        {
            returnPageIsStale = true;
        }

        switch (CurrentPage)
        {
            case ProjectWorkspaceViewModel workspace:
                await workspace.LoadAsync(workspace.SelectedFolder?.Id, workspace.SelectedItem?.Id);
                break;
            case CalendarViewModel calendarPage:
                await calendarPage.LoadAsync();
                break;
            case TrashViewModel trashPage:
                await trashPage.LoadAsync();
                break;
            case SearchViewModel searchPage:
                await searchPage.RefreshAsync();
                break;
            case HomeViewModel home:
                await home.LoadAsync();
                break;
        }
    }

    /// <summary>The workspace shows a refusal in its status toast; other screens have no such place, so they get a message box.</summary>
    async Task IUndoHost.ReportRefusalAsync(string message)
    {
        if (CurrentPage is not ProjectWorkspaceViewModel)
        {
            await dialogs.ShowMessageAsync("Undo and redo", message);
        }
    }

    Task IUndoHost.ReportUnexpectedErrorAsync(Exception exception)
    {
        return ReportUnexpectedErrorAsync(exception);
    }


    public ViewModelBase? CurrentPage
    {
        get => currentPage;
        private set
        {
            if (SetProperty(ref currentPage, value))
            {
                pageVersion++;
                Undo?.ClearStatus();
            }
        }
    }

    public async Task GoHomeAsync()
    {
        DiscardTransientReturnPage();
        DisposeCurrentPage();
        var version = pageVersion;
        var page = new HomeViewModel(projectService, dialogs, this, savedSearches, transfer);
        await page.LoadAsync();
        ShowIfCurrent(page, version);
    }

    public async Task OpenProjectAsync(Guid projectId)
    {
        await OpenWorkspaceAsync(projectId, null, null);
    }

    /// <inheritdoc />
    public async Task OpenSearchAsync()
    {
        if (search is null || registry is null || isOpeningSearch || CurrentPage is SearchViewModel)
        {
            return;
        }

        isOpeningSearch = true;

        try
        {
            await ShowSearchPageAsync();
        }
        finally
        {
            isOpeningSearch = false;
        }
    }

    /// <inheritdoc />
    public async Task OpenSavedSearchAsync(Guid savedSearchId)
    {
        if (search is null || registry is null || savedSearches is null || isOpeningSearch)
        {
            return;
        }

        isOpeningSearch = true;

        try
        {
            await ShowSavedSearchPageAsync(savedSearchId);
        }
        finally
        {
            isOpeningSearch = false;
        }
    }

    /// <inheritdoc />
    public async Task ReturnFromSearchAsync()
    {
        if (CurrentPage is SearchViewModel)
        {
            await ReturnFromTransientPageAsync();
        }
    }

    /// <inheritdoc />
    public async Task<SearchOpenOutcome> OpenSearchResultAsync(ItemSearchResult result)
    {
        return await OpenItemFromTransientPageAsync(result.ItemId, transientReturnPage);
    }

    /// <inheritdoc />
    public async Task<SearchOpenOutcome> OpenCalendarItemAsync(Guid itemId)
    {
        return await OpenItemFromTransientPageAsync(itemId, transientReturnPage);
    }

    /// <summary>
    /// Opens an item from the search or calendar page. <paramref name="previous"/> is the page the
    /// transient page was opened from; it is asked before it is thrown away. When the user
    /// navigates elsewhere while a lookup or the question is pending, nothing is opened.
    /// </summary>
    private async Task<SearchOpenOutcome> OpenItemFromTransientPageAsync(Guid itemId, ViewModelBase? previous)
    {
        var version = pageVersion;
        var location = await FindItemLocationAsync(itemId);

        if (version != pageVersion)
        {
            return SearchOpenOutcome.Cancelled;
        }

        if (location is null)
        {
            return SearchOpenOutcome.ItemMissing;
        }

        if (previous is IUnsavedChangesGuard guard && !await guard.ConfirmLeaveAsync())
        {
            return SearchOpenOutcome.Cancelled;
        }

        if (version != pageVersion)
        {
            return SearchOpenOutcome.Cancelled;
        }

        var opened = await OpenWorkspaceAsync(location.ProjectId, location.FolderId, itemId);
        return opened ? SearchOpenOutcome.Opened : SearchOpenOutcome.Cancelled;
    }

    /// <inheritdoc />
    public async Task OpenCalendarAsync()
    {
        if (calendar is null || rescheduler is null || clock is null || timeZone is null || isOpeningCalendar
            || CurrentPage is CalendarViewModel)
        {
            return;
        }

        isOpeningCalendar = true;

        try
        {
            var version = pageVersion;
            var origin = PageBehind(CurrentPage);
            var projectId = (origin as ProjectWorkspaceViewModel)?.ProjectId;
            var page = new CalendarViewModel(calendar, rescheduler, this, clock, timeZone, projectId,
                dispatcher: dispatcher);
            await page.LoadAsync();

            if (version != pageVersion)
            {
                page.Dispose();
                return;
            }

            ShowTransientPage(origin, page);
        }
        finally
        {
            isOpeningCalendar = false;
        }
    }

    /// <inheritdoc />
    public async Task ReturnFromCalendarAsync()
    {
        if (CurrentPage is CalendarViewModel)
        {
            await ReturnFromTransientPageAsync();
        }
    }

    /// <inheritdoc />
    public async Task OpenTrashAsync()
    {
        if (trash is null || timeZone is null || isOpeningTrash || CurrentPage is TrashViewModel)
        {
            return;
        }

        isOpeningTrash = true;

        try
        {
            await ShowTrashPageAsync(trash, timeZone);
        }
        finally
        {
            isOpeningTrash = false;
        }
    }

    /// <inheritdoc />
    public async Task ReturnFromTrashAsync()
    {
        if (CurrentPage is not TrashViewModel page)
        {
            return;
        }

        if (page.IsWorking)
        {
            return;
        }

        await ReturnFromTransientPageAsync();
    }

    /// <summary>Tells the user about a failure no screen handled, instead of crashing the app.</summary>
    public Task ReportUnexpectedErrorAsync(Exception exception)
    {
        return dialogs.ShowMessageAsync("Something went wrong", exception.Message);
    }

    public async Task OpenAppSettingsAsync(Guid? returnProjectId = null)
    {
        if (settings is null)
        {
            return;
        }

        DisposeCurrentPage();
        var version = pageVersion;
        var page = new AppSettingsViewModel(settings, dialogs, this, lookups, returnProjectId, fields);
        await page.LoadAsync();
        ShowIfCurrent(page, version);
    }

    public async Task OpenProjectSettingsAsync(Guid projectId)
    {
        if (settings is null)
        {
            return;
        }

        var project = await projectService.LoadWorkspaceAsync(projectId);
        DisposeCurrentPage();
        var version = pageVersion;
        var page = new ProjectSettingsViewModel(projectId, settings, dialogs, this, fields);
        await page.LoadAsync(project.Name);
        ShowIfCurrent(page, version);
    }

    private async Task ShowSearchPageAsync()
    {
        var version = pageVersion;
        var origin = PageBehind(CurrentPage);
        var workspace = origin as ProjectWorkspaceViewModel;
        var page = CreateSearchPage(workspace?.ProjectId, workspace?.SelectedFolder?.Id);
        await page.LoadAsync();

        if (version != pageVersion)
        {
            page.Dispose();
            return;
        }

        ShowTransientPage(origin, page);
    }

    private SearchViewModel CreateSearchPage(Guid? projectId, Guid? folderId)
    {
        return new SearchViewModel(search!, registry!, projectService, this, projectId, folderId, lookups,
            parser: queryParser, savedSearchService: savedSearches, dialogs: dialogs,
            transfer: transfer);
    }

    private async Task ShowSavedSearchPageAsync(Guid savedSearchId)
    {
        var version = pageVersion;
        var saved = await savedSearches!.FindAsync(savedSearchId);

        if (saved is null)
        {
            await dialogs.ShowMessageAsync("Saved search", "This saved search no longer exists.");
            await RefreshSavedSearchListsAsync();
            return;
        }

        var origin = PageBehind(CurrentPage);
        var page = CreateSearchPageFor(saved, origin as ProjectWorkspaceViewModel);
        await page.LoadAsync();
        await page.OpenSavedAsync(saved);

        if (version != pageVersion)
        {
            page.Dispose();
            return;
        }

        ShowTransientPage(origin, page);
    }

    /// <summary>A saved search with its own project or folder opens there; an all-projects one keeps the page behind as origin.</summary>
    private SearchViewModel CreateSearchPageFor(SavedSearch saved, ProjectWorkspaceViewModel? workspace)
    {
        if (saved.ScopeKind == SavedSearchScopeKind.AllProjects)
        {
            return CreateSearchPage(workspace?.ProjectId, workspace?.SelectedFolder?.Id);
        }

        return CreateSearchPage(saved.ProjectId, saved.FolderId);
    }

    private async Task RefreshSavedSearchListsAsync()
    {
        if (CurrentPage is HomeViewModel { SavedSearches: not null } home)
        {
            await home.SavedSearches.LoadAsync();
        }

        if (CurrentPage is SearchViewModel { SavedSearches: not null } searchPage)
        {
            await searchPage.SavedSearches.LoadAsync();
        }
    }

    private async Task ShowTrashPageAsync(ITrashService trashService, TimeZoneInfo zone)
    {
        var version = pageVersion;
        var origin = PageBehind(CurrentPage);
        var projectId = (origin as ProjectWorkspaceViewModel)?.ProjectId;
        var page = new TrashViewModel(trashService, dialogs, this, zone, projectId);
        await page.LoadAsync();

        if (version != pageVersion)
        {
            page.Dispose();
            return;
        }

        ShowTransientPage(origin, page);
    }

    /// <summary>
    /// Brings the page behind a transient page up to date after a restore: Home recounts its
    /// projects and a workspace reloads, which asks its unsaved-changes guard once. Returns false
    /// when the transient page should stay on screen: the user cancelled that question, or
    /// navigation moved elsewhere meanwhile.
    /// </summary>
    private async Task<bool> RefreshPageBehindAsync(ViewModelBase leavingPage)
    {
        var version = pageVersion;
        var reloaded = await ReloadPageBehindAsync();

        if (!reloaded)
        {
            return false;
        }

        var navigatedAway = version != pageVersion || !ReferenceEquals(CurrentPage, leavingPage);
        return !navigatedAway;
    }

    private async Task<bool> ReloadPageBehindAsync()
    {
        if (transientReturnPage is HomeViewModel home)
        {
            await home.LoadAsync();
            return true;
        }

        if (transientReturnPage is ProjectWorkspaceViewModel workspace)
        {
            return await workspace.LoadAsync(workspace.SelectedFolder?.Id, workspace.SelectedItem?.Id);
        }

        return true;
    }

    /// <summary>
    /// True when something was restored while the page behind the transient page was out of sight,
    /// either from the trash on screen or from a trash page that was replaced by search or the calendar.
    /// </summary>
    private bool ReturnPageIsOutOfDate()
    {
        return returnPageIsStale || CurrentPage is TrashViewModel { MayHaveRestored: true };
    }

    /// <summary>
    /// The page a search, calendar or trash page was opened from, or the page itself for any
    /// other page. These pages never stack: opening one from another keeps the original page as
    /// the single return target, so every unsaved-changes guard sits directly behind the page on screen.
    /// </summary>
    private ViewModelBase? PageBehind(ViewModelBase? page)
    {
        return IsTransientPage(page) ? transientReturnPage : page;
    }

    private static bool IsTransientPage(ViewModelBase? page)
    {
        return page is SearchViewModel or CalendarViewModel or TrashViewModel;
    }

    private void ShowTransientPage(ViewModelBase? origin, ViewModelBase page)
    {
        if (IsTransientPage(CurrentPage))
        {
            returnPageIsStale |= CurrentPage is TrashViewModel { MayHaveRestored: true };
            (CurrentPage as IDisposable)?.Dispose();
        }
        else
        {
            returnPageIsStale = false;
        }

        transientReturnPage = origin;
        CurrentPage = page;
    }

    /// <summary>Leaves the search, calendar or trash page for the page it was opened from, or Home when there is none.</summary>
    private async Task ReturnFromTransientPageAsync()
    {
        if (transientReturnPage is null)
        {
            await GoHomeAsync();
            return;
        }

        if (ReturnPageIsOutOfDate())
        {
            var refreshed = await RefreshPageBehindAsync(CurrentPage!);

            if (!refreshed)
            {
                return;
            }
        }

        (CurrentPage as IDisposable)?.Dispose();
        CurrentPage = transientReturnPage;
        transientReturnPage = null;
        returnPageIsStale = false;
        await RefreshSavedSearchListsAsync();
    }

    /// <summary>Disposes the page on screen and marks any navigation still waiting on it as stale.</summary>
    private void DisposeCurrentPage()
    {
        pageVersion++;
        (CurrentPage as IDisposable)?.Dispose();
    }

    private async Task<ItemLocation?> FindItemLocationAsync(Guid itemId)
    {
        if (itemService is null)
        {
            return null;
        }

        return await itemService.FindLocationAsync(itemId);
    }

    /// <summary>
    /// Loads and shows a workspace. Returns false when the user navigated elsewhere while it loaded
    /// (the workspace is then disposed and the newer page stays) or the project was unavailable.
    /// </summary>
    private async Task<bool> OpenWorkspaceAsync(Guid projectId, Guid? folderId, Guid? itemId)
    {
        DiscardTransientReturnPage();
        DisposeCurrentPage();
        var version = pageVersion;
        var page = new ProjectWorkspaceViewModel(projectId, projectService, folderService, dialogs, this,
            itemService, clock, timeZone, dispatcher, fieldLoader, Undo);

        try
        {
            await page.LoadAsync(folderId, itemId);
            return ShowIfCurrent(page, version);
        }
        catch (DomainRuleException exception)
        {
            page.Dispose();
            await ReportUnavailableProjectAsync(version, exception);
            return false;
        }
        catch
        {
            page.Dispose();
            throw;
        }
    }

    private async Task ReportUnavailableProjectAsync(int version, DomainRuleException exception)
    {
        if (version != pageVersion)
        {
            return;
        }

        await GoHomeAsync();
        await dialogs.ShowMessageAsync("Project unavailable", exception.Message);
    }

    /// <summary>
    /// Shows a page that finished loading, unless the user navigated elsewhere since
    /// <paramref name="version"/> was read; a stale page is disposed instead.
    /// </summary>
    private bool ShowIfCurrent(ViewModelBase page, int version)
    {
        if (version != pageVersion)
        {
            (page as IDisposable)?.Dispose();
            return false;
        }

        CurrentPage = page;
        return true;
    }

    private void DiscardTransientReturnPage()
    {
        (transientReturnPage as IDisposable)?.Dispose();
        transientReturnPage = null;
        returnPageIsStale = false;
    }

    private static ICustomFieldInputLoader? CreateFieldLoader(FieldService? fields, ItemService? items)
    {
        if (fields is null || items is null)
        {
            return null;
        }

        return new CustomFieldInputLoader(fields, items);
    }
}