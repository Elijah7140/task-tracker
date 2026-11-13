using TaskTracker.Core;
using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;
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
    private ViewModelBase? currentPage;

    public MainWindowViewModel(ProjectService projectService, FolderService folderService, IDialogService dialogs,
        ItemService? itemService = null, TimeProvider? clock = null, TimeZoneInfo? timeZone = null,
        IUiDispatcher? dispatcher = null)
    {
        this.projectService = projectService;
        this.folderService = folderService;
        this.dialogs = dialogs;
        this.itemService = itemService;
        this.clock = clock;
        this.timeZone = timeZone;
        this.dispatcher = dispatcher;
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
            itemService, clock, timeZone, dispatcher);

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
}