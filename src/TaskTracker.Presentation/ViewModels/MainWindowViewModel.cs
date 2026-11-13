using TaskTracker.Core;
using TaskTracker.Core.Projects;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Owns the current page and handles application navigation.</summary>
public sealed class MainWindowViewModel : ViewModelBase, INavigationService
{
    private readonly ProjectService projectService;
    private readonly FolderService folderService;
    private readonly IDialogService dialogs;
    private ViewModelBase? currentPage;

    public MainWindowViewModel(ProjectService projectService, FolderService folderService, IDialogService dialogs)
    {
        this.projectService = projectService;
        this.folderService = folderService;
        this.dialogs = dialogs;
    }

    public string Title => "Task Tracker";

    public ViewModelBase? CurrentPage
    {
        get => currentPage;
        private set => SetProperty(ref currentPage, value);
    }

    public async Task GoHomeAsync()
    {
        var page = new HomeViewModel(projectService, dialogs, this);
        await page.LoadAsync();
        CurrentPage = page;
    }

    public async Task OpenProjectAsync(Guid projectId)
    {
        var page = new ProjectWorkspaceViewModel(projectId, projectService, folderService, dialogs, this);

        try
        {
            await page.LoadAsync();
            CurrentPage = page;
        }
        catch (DomainRuleException exception)
        {
            await GoHomeAsync();
            await dialogs.ShowMessageAsync("Project unavailable", exception.Message);
        }
    }
}