using TaskTracker.Core;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
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
    private ViewModelBase? currentPage;

    public MainWindowViewModel(ProjectService projectService, FolderService folderService, IDialogService dialogs,
        ItemService? itemService = null, TimeProvider? clock = null, TimeZoneInfo? timeZone = null,
        IUiDispatcher? dispatcher = null, SettingsService? settings = null, LookupService? lookups = null,
        FieldService? fields = null)
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
        fieldLoader = CreateFieldLoader(fields, itemService);
    }

    public string Title => "Task Tracker";

    public ViewModelBase? CurrentPage
    {
        get => currentPage;
        private set => SetProperty(ref currentPage, value);
    }

    public async Task GoHomeAsync()
    {
        (CurrentPage as IDisposable)?.Dispose();
        var page = new HomeViewModel(projectService, dialogs, this);
        await page.LoadAsync();
        CurrentPage = page;
    }

    public async Task OpenProjectAsync(Guid projectId)
    {
        (CurrentPage as IDisposable)?.Dispose();
        var page = new ProjectWorkspaceViewModel(projectId, projectService, folderService, dialogs, this,
            itemService, clock, timeZone, dispatcher, fieldLoader);

        try
        {
            await page.LoadAsync();
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

    private static ICustomFieldInputLoader? CreateFieldLoader(FieldService? fields, ItemService? items)
    {
        if (fields is null || items is null)
        {
            return null;
        }

        return new CustomFieldInputLoader(fields, items);
    }
}