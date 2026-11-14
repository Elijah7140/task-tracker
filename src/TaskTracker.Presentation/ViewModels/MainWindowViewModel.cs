using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core;
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
    private ViewModelBase? searchReturnPage;
    private bool isOpeningSearch;
    private ViewModelBase? currentPage;

    public MainWindowViewModel(ProjectService projectService, FolderService folderService, IDialogService dialogs,
        ItemService? itemService = null, TimeProvider? clock = null, TimeZoneInfo? timeZone = null,
        IUiDispatcher? dispatcher = null, SettingsService? settings = null, LookupService? lookups = null,
        FieldService? fields = null, IItemSearchService? search = null, IFieldRegistry? registry = null)
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
        fieldLoader = CreateFieldLoader(fields, itemService);
        SearchCommand = new AsyncRelayCommand(OpenSearchAsync);
    }

    public string Title => "Task Tracker";

    public ICommand SearchCommand { get; }

    public ViewModelBase? CurrentPage
    {
        get => currentPage;
        private set => SetProperty(ref currentPage, value);
    }

    public async Task GoHomeAsync()
    {
        DiscardSearchReturnPage();
        (CurrentPage as IDisposable)?.Dispose();
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
        var location = await FindItemLocationAsync(result.ItemId);

        if (location is null)
        {
            return SearchOpenOutcome.ItemMissing;
        }

        if (searchReturnPage is IUnsavedChangesGuard guard && !await guard.ConfirmLeaveAsync())
        {
            return SearchOpenOutcome.Cancelled;
        }

        await OpenWorkspaceAsync(location.ProjectId, location.FolderId, result.ItemId);
        return SearchOpenOutcome.Opened;
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

        (CurrentPage as IDisposable)?.Dispose();
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
        (CurrentPage as IDisposable)?.Dispose();
        var page = new ProjectSettingsViewModel(projectId, settings, dialogs, this, fields);
        await page.LoadAsync(project.Name);
        CurrentPage = page;
    }

    private async Task ShowSearchPageAsync()
    {
        var previous = CurrentPage;
        var workspace = previous as ProjectWorkspaceViewModel;
        var page = new SearchViewModel(search!, registry!, projectService, this,
            workspace?.ProjectId, workspace?.SelectedFolder?.Id, lookups);
        await page.LoadAsync();
        searchReturnPage = previous;
        CurrentPage = page;
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
        (CurrentPage as IDisposable)?.Dispose();
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

    private static ICustomFieldInputLoader? CreateFieldLoader(FieldService? fields, ItemService? items)
    {
        if (fields is null || items is null)
        {
            return null;
        }

        return new CustomFieldInputLoader(fields, items);
    }
}