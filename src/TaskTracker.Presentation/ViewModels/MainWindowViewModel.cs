using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core;
using TaskTracker.Core.Calendar;
using TaskTracker.Core.Completion;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Reminders;
using TaskTracker.Core.SavedSearches;
using TaskTracker.Core.Search;
using TaskTracker.Core.Search.Syntax;
using TaskTracker.Core.Settings;
using TaskTracker.Core.Tickets;
using TaskTracker.Core.Today;
using TaskTracker.Core.Trash;
using TaskTracker.Core.Undo;
using TaskTracker.Presentation.Installation;
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
    private readonly TodayService? today;
    private readonly TicketService? tickets;
    private readonly DataSaved? saves;
    private readonly SavedSearchService? savedSearches;
    private readonly ItemQueryParser? queryParser;
    private readonly TransferServices? transfer;
    private readonly ILinkLauncher? linkLauncher;
    private readonly InstallationServices? installation;
    private readonly AppUpdateViewModel? appUpdates;
    private ViewModelBase? transientReturnPage;
    private long returnPageRevision;
    private Task pendingTransientWrites = Task.CompletedTask;
    private bool returnPageIsStale;
    private bool isOpeningSearch;
    private bool isOpeningCalendar;
    private bool isOpeningTrash;
    private bool isOpeningToday;
    private bool isOpeningTickets;
    private bool isOpeningSettings;
    private bool showsTitleBar;
    private bool isChangingTransientItem;
    private ViewModelBase? currentPage;
    private RemindersViewModel? reminders;
    private int pageVersion;
    private int? returningPageVersion;

    public MainWindowViewModel(ProjectService projectService, FolderService folderService, IDialogService dialogs,
        ItemService? itemService = null, TimeProvider? clock = null, TimeZoneInfo? timeZone = null,
        IUiDispatcher? dispatcher = null, SettingsService? settings = null, LookupService? lookups = null,
        FieldService? fields = null, IItemSearchService? search = null, IFieldRegistry? registry = null,
        CalendarService? calendar = null, ICalendarRescheduler? rescheduler = null,
        ITrashService? trash = null, SavedSearchService? savedSearches = null, ItemQueryParser? queryParser = null,
        UndoHistory? undoHistory = null, TransferServices? transfer = null, ILinkLauncher? linkLauncher = null,
        InstallationServices? installation = null, TodayService? today = null, DataSaved? saves = null,
        TicketService? tickets = null)
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
        this.today = today;
        this.tickets = tickets;
        this.saves = saves;
        this.savedSearches = savedSearches;
        this.queryParser = queryParser;
        this.transfer = transfer;
        this.linkLauncher = linkLauncher;
        this.installation = installation;
        if (installation is not null)
        {
            appUpdates = new AppUpdateViewModel(installation.Updates, ConfirmUpdateRestartAsync);
        }

        Undo = undoHistory is null ? null : new UndoCoordinator(undoHistory, this);
        fieldLoader = CreateFieldLoader(fields, itemService);
        SearchCommand = new AsyncRelayCommand(OpenSearchAsync);
        CalendarCommand = new AsyncRelayCommand(OpenCalendarAsync);
        TrashCommand = new AsyncRelayCommand(OpenTrashAsync);
        TicketsCommand = new AsyncRelayCommand(OpenTicketsAsync);
        TodayCommand = new AsyncRelayCommand(OpenTodayAsync);
        SettingsCommand = new AsyncRelayCommand(OpenSettingsFromTitleBarAsync);
    }

    public RemindersViewModel? Reminders
    {
        get => reminders;
        private set => SetProperty(ref reminders, value);
    }

    public RemindersViewModel EnableReminders(ReminderService service)
    {
        Reminders ??= new RemindersViewModel(service, dialogs, OpenReminderItemAsync, CompleteReminderItemAsync);
        return Reminders;
    }

    private Task<SearchOpenOutcome> OpenReminderItemAsync(Guid itemId)
    {
        var previous = IsTransientPage(CurrentPage) ? transientReturnPage : CurrentPage;
        return OpenItemFromTransientPageAsync(itemId, previous);
    }

    /// <summary>
    /// Completes an item from the reminder panel. Returns null when the user cancels; the panel
    /// reports a blocked result and dismisses the entry once the change is applied.
    /// </summary>
    private async Task<CompletionResult?> CompleteReminderItemAsync(Guid itemId)
    {
        if (itemService is null || await FindItemLocationAsync(itemId) is not { } location)
        {
            throw new DomainRuleException("This item is no longer available.");
        }

        var workspace = CurrentPage as ProjectWorkspaceViewModel;
        if (workspace is not null && !await workspace.ResolveDraftAsync())
        {
            return null;
        }

        var result = await ItemCompletion.SetAsync(itemService, dialogs, location, itemId, true);
        if (result is not CompletionResult.Applied applied)
        {
            return result;
        }

        await ((IUndoHost)this).ReloadAsync();
        if (applied.LastRepeat && CurrentPage is ProjectWorkspaceViewModel current)
        {
            current.ReportLastRepeat();
        }

        return applied;
    }

    public string Title => "Task Tracker";

    public ICommand SearchCommand { get; }

    public ICommand CalendarCommand { get; }

    public ICommand TrashCommand { get; }

    public ICommand TicketsCommand { get; }

    public ICommand TodayCommand { get; }

    /// <summary>Opens App Settings from whichever page is on show.</summary>
    public ICommand SettingsCommand { get; }

    /// <summary>
    /// True when the window draws its own title bar, which holds the navigation buttons. The desktop
    /// app turns it on when it extends the client area into the system title bar.
    /// </summary>
    public bool ShowsTitleBar
    {
        get => showsTitleBar;
        set => SetProperty(ref showsTitleBar, value);
    }

    /// <summary>Undo and redo for the whole window; null when the shell was built without a history.</summary>
    public UndoCoordinator? Undo { get; }

    string? IUndoHost.UndoBlockedReason => PageBehind(CurrentPage) switch
    {
        AppSettingsViewModel { HasUnsavedChanges: true } or ProjectSettingsViewModel { IsDirty: true }
            => "Save or discard your settings before undoing or redoing.",
        ProjectWorkspaceViewModel { HasUnsavedChanges: true }
            => "Save or discard your item edits before undoing or redoing.",
        _ => null
    };

    /// <summary>
    /// Brings the screen on show up to date. A transient page also marks the page
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
            case TicketsViewModel ticketsPage:
                await ticketsPage.LoadAsync();
                break;
            case TodayViewModel todayPage:
                await todayPage.LoadAsync();
                break;
            case TrashViewModel trashPage:
                await trashPage.LoadAsync();
                break;
            case SearchViewModel searchPage:
                await searchPage.RefreshAsync();
                break;
            case AppSettingsViewModel or ProjectSettingsViewModel:
                await ReloadSettingsAsync(CurrentPage);
                break;
            case HomeViewModel home:
                await home.LoadAsync();
                break;
        }
    }

    private async Task<bool> ReloadSettingsAsync(ViewModelBase page)
    {
        if (!await ((IUnsavedChangesGuard)page).ConfirmLeaveAsync())
        {
            return false;
        }

        if (page is AppSettingsViewModel appSettings)
        {
            await appSettings.LoadAsync();
            return true;
        }

        return await ReloadProjectSettingsAsync((ProjectSettingsViewModel)page);
    }

    private async Task<bool> ReloadProjectSettingsAsync(ProjectSettingsViewModel page)
    {
        ProjectWorkspaceSnapshot project;
        try
        {
            project = await projectService.LoadWorkspaceAsync(page.ProjectId);
        }
        catch (DomainRuleException)
        {
            await GoHomeAsync();
            return false;
        }

        await page.LoadAsync(project.Name);
        return true;
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
            page.WriteStarted += TrackTransientWrite;
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
    public async Task OpenTicketsAsync()
    {
        if (tickets is null || saves is null || isOpeningTickets || CurrentPage is TicketsViewModel)
        {
            return;
        }

        isOpeningTickets = true;
        try
        {
            var version = pageVersion;
            var origin = PageBehind(CurrentPage);
            var ui = dispatcher ?? new SynchronizationContextDispatcher(SynchronizationContext.Current);
            var page = new TicketsViewModel(tickets, this, saves, ui);
            page.WriteStarted += TrackTransientWrite;
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
            isOpeningTickets = false;
        }
    }

    /// <inheritdoc />
    public Task ReturnFromTicketsAsync()
    {
        return CurrentPage is TicketsViewModel ? ReturnFromTransientPageAsync() : Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task<SearchOpenOutcome> OpenTicketItemAsync(Guid itemId)
    {
        return OpenItemFromTransientPageAsync(itemId, transientReturnPage);
    }

    /// <inheritdoc />
    public async Task OpenTodayAsync()
    {
        if (today is null || saves is null || itemService is null || clock is null || isOpeningToday
            || CurrentPage is TodayViewModel)
        {
            return;
        }

        isOpeningToday = true;
        try
        {
            await ShowTodayPageAsync(today, itemService, saves, clock);
        }
        finally
        {
            isOpeningToday = false;
        }
    }

    private async Task ShowTodayPageAsync(TodayService service, ItemService items, DataSaved dataSaved, TimeProvider time)
    {
        var version = pageVersion;
        var origin = PageBehind(CurrentPage);
        var ui = dispatcher ?? new SynchronizationContextDispatcher(SynchronizationContext.Current);
        var page = new TodayViewModel(service, items, dataSaved, time, ui, this);
        page.WriteStarted += TrackTransientWrite;
        await page.LoadAsync();

        if (version != pageVersion)
        {
            page.Dispose();
            return;
        }

        ShowTransientPage(origin, page);
    }

    /// <inheritdoc />
    public Task ReturnFromTodayAsync()
    {
        return CurrentPage is TodayViewModel ? ReturnFromTransientPageAsync() : Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task<SearchOpenOutcome> OpenTodayItemAsync(Guid itemId)
    {
        return OpenItemFromTransientPageAsync(itemId, transientReturnPage);
    }

    /// <inheritdoc />
    public Task PushBackAsync(Guid itemId)
    {
        if (itemService is null || !IsTransientPage(CurrentPage) || isChangingTransientItem)
        {
            return Task.CompletedTask;
        }

        var write = SavePushBackAsync(itemService, itemId);
        TrackTransientWrite(write);
        return write;
    }

    private Task SavePushBackAsync(ItemService items, Guid itemId)
    {
        return SaveTransientItemAsync(async () =>
        {
            await items.PushBackOneDayAsync(itemId);
            return true;
        }, "Push back one day");
    }

    private async Task SaveTransientItemAsync(Func<Task<bool>> save, string errorTitle)
    {
        var page = CurrentPage;
        var origin = transientReturnPage;
        isChangingTransientItem = true;
        try
        {
            if (!await save())
            {
                return;
            }

            returnPageIsStale |= origin is not null && ReferenceEquals(origin, transientReturnPage);
            if (ReferenceEquals(page, CurrentPage))
            {
                await ((IUndoHost)this).ReloadAsync();
            }
        }
        catch (DomainRuleException exception)
        {
            await dialogs.ShowMessageAsync(errorTitle, exception.Message);
        }
        catch (Exception exception)
        {
            await ReportUnexpectedErrorAsync(exception);
        }
        finally
        {
            isChangingTransientItem = false;
        }
    }

    /// <inheritdoc />
    public async Task<(IReadOnlyList<StatusLevel> Statuses, IReadOnlyList<PriorityLevel> Priorities)> LoadRowLookupsAsync(
        CancellationToken cancellationToken = default)
    {
        if (lookups is null)
        {
            return ([], []);
        }

        var statuses = await lookups.StatusesAsync(cancellationToken);
        var priorities = await lookups.PriorityLevelsAsync(cancellationToken);
        return (statuses, priorities);
    }

    /// <inheritdoc />
    public Task SetRowStatusAsync(Guid itemId, Guid? statusId)
    {
        return StartTransientItemChange(items => ItemLookupAction.SetStatusAsync(items, dialogs, itemId, statusId));
    }

    /// <inheritdoc />
    public Task SetRowPriorityAsync(Guid itemId, Guid? priorityId)
    {
        return StartTransientItemChange(items => ItemLookupAction.SetPriorityAsync(items, itemId, priorityId));
    }

    private Task StartTransientItemChange(Func<ItemService, Task<bool>> change)
    {
        if (itemService is null || !IsTransientPage(CurrentPage) || isChangingTransientItem)
        {
            return Task.CompletedTask;
        }

        var items = itemService;
        var write = SaveTransientItemAsync(() => change(items), "Item action failed");
        TrackTransientWrite(write);
        return write;
    }

    private void TrackTransientWrite(Task write)
    {
        if (!write.IsCompleted)
        {
            pendingTransientWrites = pendingTransientWrites.IsCompleted
                ? write
                : Task.WhenAll(pendingTransientWrites, write);
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
        var page = new AppSettingsViewModel(settings, dialogs, this, lookups, returnProjectId, fields, installation, appUpdates);
        await page.LoadAsync();
        ShowIfCurrent(page, version);
    }

    /// <summary>
    /// Opens App Settings from the title bar. A transient page first returns to the page behind it,
    /// and the page being left gets its usual unsaved-changes guard. Back from settings returns to
    /// the project the user was in, if any.
    /// </summary>
    public async Task OpenSettingsFromTitleBarAsync()
    {
        if (settings is null || isOpeningSettings || CurrentPage is AppSettingsViewModel)
        {
            return;
        }

        isOpeningSettings = true;
        try
        {
            await LeaveForSettingsAsync();
        }
        finally
        {
            isOpeningSettings = false;
        }
    }

    private async Task LeaveForSettingsAsync()
    {
        if (IsTransientPage(CurrentPage))
        {
            await ReturnFromTransientPageAsync();
        }

        switch (CurrentPage)
        {
            case ProjectWorkspaceViewModel workspace:
                await workspace.OpenSettingsAsync();
                break;
            case ProjectSettingsViewModel projectSettings when await projectSettings.ConfirmLeaveAsync():
                await OpenAppSettingsAsync(projectSettings.ProjectId);
                break;
            case HomeViewModel:
                await OpenAppSettingsAsync();
                break;
        }
    }

    private async Task<bool> ConfirmUpdateRestartAsync()
    {
        var version = pageVersion;
        return (CurrentPage is not IUnsavedChangesGuard guard || await guard.ConfirmLeaveAsync())
            && pageVersion == version;
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
    /// Reloads the return page through its normal draft guard and checks for commits during the reload.
    /// </summary>
    private async Task<bool> PrepareReturnPageAsync(int version)
    {
        while (version == pageVersion)
        {
            if (!pendingTransientWrites.IsCompleted)
            {
                await pendingTransientWrites;
                continue;
            }

            var revision = saves?.Revision ?? 0;
            if (!ReturnPageIsOutOfDate())
            {
                return true;
            }

            if (!await ReloadPageBehindAsync())
            {
                return false;
            }

            if (pendingTransientWrites.IsCompleted && (saves?.Revision ?? 0) == revision)
            {
                return version == pageVersion;
            }
        }

        return false;
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

        if (transientReturnPage is AppSettingsViewModel or ProjectSettingsViewModel)
        {
            return await ReloadSettingsAsync(transientReturnPage);
        }

        return true;
    }

    /// <summary>
    /// A commit while the return page was hidden invalidates its snapshot.
    /// </summary>
    private bool ReturnPageIsOutOfDate()
    {
        return returnPageIsStale || saves?.Revision > returnPageRevision
            || CurrentPage is TrashViewModel { MayHaveRestored: true };
    }

    /// <summary>
    /// The page a transient page was opened from, or the page itself for any
    /// other page. These pages never stack: opening one from another keeps the original page as
    /// the single return target, so every unsaved-changes guard sits directly behind the page on screen.
    /// </summary>
    private ViewModelBase? PageBehind(ViewModelBase? page)
    {
        return IsTransientPage(page) ? transientReturnPage : page;
    }

    private static bool IsTransientPage(ViewModelBase? page)
    {
        return page is SearchViewModel or CalendarViewModel or TrashViewModel or TodayViewModel or TicketsViewModel;
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
            returnPageRevision = saves?.Revision ?? 0;
        }

        transientReturnPage = origin;
        CurrentPage = page;
    }

    /// <summary>Leaves the transient page for the page it was opened from, or Home when there is none.</summary>
    private async Task ReturnFromTransientPageAsync()
    {
        if (transientReturnPage is null)
        {
            await GoHomeAsync();
            return;
        }

        var version = pageVersion;
        if (returningPageVersion == version)
        {
            return;
        }

        returningPageVersion = version;
        try
        {
            if (await PrepareReturnPageAsync(version))
            {
                await ShowReturnPageAsync();
            }
        }
        finally
        {
            if (returningPageVersion == version)
            {
                returningPageVersion = null;
            }
        }
    }

    private async Task ShowReturnPageAsync()
    {
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
            itemService, clock, timeZone, dispatcher, fieldLoader, Undo, linkLauncher);

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