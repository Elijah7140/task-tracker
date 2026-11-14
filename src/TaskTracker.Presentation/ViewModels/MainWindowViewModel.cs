using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core;
using TaskTracker.Core.Calendar;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Search;
using TaskTracker.Core.Settings;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Owns the current page and handles application navigation.</summary>
public sealed class MainWindowViewModel : ViewModelBase, INavigationService
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
    private ViewModelBase? searchReturnPage;
    private ViewModelBase? calendarReturnPage;
    private bool isOpeningSearch;
    private bool isOpeningCalendar;
    private ViewModelBase? currentPage;
    private int pageVersion;

    public MainWindowViewModel(ProjectService projectService, FolderService folderService, IDialogService dialogs,
        ItemService? itemService = null, TimeProvider? clock = null, TimeZoneInfo? timeZone = null,
        IUiDispatcher? dispatcher = null, SettingsService? settings = null, LookupService? lookups = null,
        FieldService? fields = null, IItemSearchService? search = null, IFieldRegistry? registry = null,
        CalendarService? calendar = null)
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
        fieldLoader = CreateFieldLoader(fields, itemService);
        SearchCommand = new AsyncRelayCommand(OpenSearchAsync);
        CalendarCommand = new AsyncRelayCommand(OpenCalendarAsync);
    }

    public string Title => "Task Tracker";

    public ICommand SearchCommand { get; }

    public ICommand CalendarCommand { get; }

    public ViewModelBase? CurrentPage
    {
        get => currentPage;
        private set
        {
            if (SetProperty(ref currentPage, value))
            {
                pageVersion++;
            }
        }
    }

    public async Task GoHomeAsync()
    {
        DiscardSearchReturnPage();
        DiscardCalendarReturnPage();
        DisposeCurrentPage();
        var page = new HomeViewModel(projectService, dialogs, this);
        await page.LoadAsync();
        CurrentPage = page;
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
    public async Task ReturnFromSearchAsync()
    {
        if (CurrentPage is not SearchViewModel searchPage)
        {
            return;
        }

        if (searchReturnPage is null)
        {
            await GoHomeAsync();
            return;
        }

        searchPage.Dispose();
        CurrentPage = searchReturnPage;
        searchReturnPage = null;
    }

    /// <inheritdoc />
    public async Task<SearchOpenOutcome> OpenSearchResultAsync(ItemSearchResult result)
    {
        return await OpenItemFromTransientPageAsync(result.ItemId, searchReturnPage);
    }

    /// <inheritdoc />
    public async Task<SearchOpenOutcome> OpenCalendarItemAsync(Guid itemId)
    {
        return await OpenItemFromTransientPageAsync(itemId, calendarReturnPage);
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

        await OpenWorkspaceAsync(location.ProjectId, location.FolderId, itemId);
        return SearchOpenOutcome.Opened;
    }

    /// <inheritdoc />
    public async Task OpenCalendarAsync()
    {
        if (calendar is null || clock is null || timeZone is null || isOpeningCalendar
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
            var page = new CalendarViewModel(calendar, this, clock, timeZone, projectId,
                dispatcher: dispatcher);
            await page.LoadAsync();

            if (version != pageVersion)
            {
                page.Dispose();
                return;
            }

            ShowCalendarPage(origin, page);
        }
        finally
        {
            isOpeningCalendar = false;
        }
    }

    /// <inheritdoc />
    public async Task ReturnFromCalendarAsync()
    {
        if (CurrentPage is not CalendarViewModel page)
        {
            return;
        }

        if (calendarReturnPage is null)
        {
            await GoHomeAsync();
            return;
        }

        page.Dispose();
        CurrentPage = calendarReturnPage;
        calendarReturnPage = null;
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
        var page = new AppSettingsViewModel(settings, dialogs, this, lookups, returnProjectId, fields);
        await page.LoadAsync();
        CurrentPage = page;
    }

    public async Task OpenProjectSettingsAsync(Guid projectId)
    {
        if (settings is null)
        {
            return;
        }

        var project = await projectService.LoadWorkspaceAsync(projectId);
        DisposeCurrentPage();
        var page = new ProjectSettingsViewModel(projectId, settings, dialogs, this, fields);
        await page.LoadAsync(project.Name);
        CurrentPage = page;
    }

    private async Task ShowSearchPageAsync()
    {
        var version = pageVersion;
        var origin = PageBehind(CurrentPage);
        var workspace = origin as ProjectWorkspaceViewModel;
        var page = new SearchViewModel(search!, registry!, projectService, this,
            workspace?.ProjectId, workspace?.SelectedFolder?.Id, lookups);
        await page.LoadAsync();

        if (version != pageVersion)
        {
            page.Dispose();
            return;
        }

        ShowSearchPage(origin, page);
    }

    /// <summary>
    /// The page a search or calendar page was opened from, or the page itself for any other page.
    /// Search and calendar never stack: opening one from the other keeps the original page as the
    /// single return target, so every unsaved-changes guard sits directly behind the page on screen.
    /// </summary>
    private ViewModelBase? PageBehind(ViewModelBase? page)
    {
        return page switch
        {
            SearchViewModel => searchReturnPage,
            CalendarViewModel => calendarReturnPage,
            _ => page
        };
    }

    private void ShowSearchPage(ViewModelBase? origin, SearchViewModel page)
    {
        if (CurrentPage is CalendarViewModel calendarPage)
        {
            calendarPage.Dispose();
            calendarReturnPage = null;
        }

        searchReturnPage = origin;
        CurrentPage = page;
    }

    private void ShowCalendarPage(ViewModelBase? origin, CalendarViewModel page)
    {
        if (CurrentPage is SearchViewModel searchPage)
        {
            searchPage.Dispose();
            searchReturnPage = null;
        }

        calendarReturnPage = origin;
        CurrentPage = page;
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

    private async Task OpenWorkspaceAsync(Guid projectId, Guid? folderId, Guid? itemId)
    {
        DiscardSearchReturnPage();
        DiscardCalendarReturnPage();
        DisposeCurrentPage();
        var page = new ProjectWorkspaceViewModel(projectId, projectService, folderService, dialogs, this,
            itemService, clock, timeZone, dispatcher, fieldLoader);

        try
        {
            await page.LoadAsync(folderId, itemId);
            CurrentPage = page;
        }
        catch (DomainRuleException exception)
        {
            page.Dispose();
            await GoHomeAsync();
            await dialogs.ShowMessageAsync("Project unavailable", exception.Message);
        }
        catch
        {
            page.Dispose();
            throw;
        }
    }

    private void DiscardSearchReturnPage()
    {
        (searchReturnPage as IDisposable)?.Dispose();
        searchReturnPage = null;
    }

    private void DiscardCalendarReturnPage()
    {
        (calendarReturnPage as IDisposable)?.Dispose();
        calendarReturnPage = null;
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