using System.Collections.ObjectModel;
using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core;
using TaskTracker.Core.Projects;
using TaskTracker.Core.SavedSearches;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Displays project summaries and coordinates project actions.</summary>
public sealed class HomeViewModel : ViewModelBase
{
    private readonly ProjectService projects;
    private readonly IDialogService dialogs;
    private readonly INavigationService navigation;

    public HomeViewModel(ProjectService projects, IDialogService dialogs, INavigationService navigation,
        SavedSearchService? savedSearches = null, TransferServices? transfer = null)
    {
        this.projects = projects;
        this.dialogs = dialogs;
        this.navigation = navigation;
        SavedSearches = savedSearches is null ? null : new SavedSearchListViewModel(savedSearches, dialogs, navigation);
        Transfer = CreateTransfer(transfer);
        CreateCommand = new AsyncRelayCommand(CreateAsync);
        OpenCommand = new AsyncRelayCommand<ProjectCardViewModel>(OpenAsync);
        RenameCommand = new AsyncRelayCommand<ProjectCardViewModel>(RenameAsync);
        DeleteCommand = new AsyncRelayCommand<ProjectCardViewModel>(DeleteAsync);
        SettingsCommand = new AsyncRelayCommand(() => navigation.OpenAppSettingsAsync());
        SearchCommand = new AsyncRelayCommand(navigation.OpenSearchAsync);
        CalendarCommand = new AsyncRelayCommand(navigation.OpenCalendarAsync);
        TrashCommand = new AsyncRelayCommand(navigation.OpenTrashAsync);
        ProjectSettingsCommand = new AsyncRelayCommand<ProjectCardViewModel>(OpenProjectSettingsAsync);
    }

    public ObservableCollection<ProjectCardViewModel> Cards { get; } = [];

    /// <summary>The saved searches shown as quick links, or null when saved searches are unavailable.</summary>
    public SavedSearchListViewModel? SavedSearches { get; }

    /// <summary>The Import / Export menu, or null when import and export are unavailable.</summary>
    public DataTransferViewModel? Transfer { get; }

    public bool IsEmpty => Cards.Count == 0;

    public ICommand CreateCommand { get; }

    public ICommand OpenCommand { get; }

    public ICommand RenameCommand { get; }

    public ICommand DeleteCommand { get; }

    public ICommand SettingsCommand { get; }

    public ICommand SearchCommand { get; }

    public ICommand CalendarCommand { get; }

    public ICommand TrashCommand { get; }

    public ICommand ProjectSettingsCommand { get; }

    public async Task LoadAsync()
    {
        try
        {
            Cards.Clear();

            foreach (var summary in await projects.ListAsync())
            {
                Cards.Add(new ProjectCardViewModel(summary));
            }

            OnPropertyChanged(nameof(IsEmpty));
        }
        catch (DomainRuleException exception)
        {
            await dialogs.ShowMessageAsync("Project action failed", exception.Message);
        }

        await ReloadSavedSearchesAsync();
    }

    /// <summary>Refreshes the saved search quick links, for example after the search page changed them.</summary>
    public async Task ReloadSavedSearchesAsync()
    {
        if (SavedSearches is not null)
        {
            await SavedSearches.LoadAsync();
        }
    }

    public async Task CreateAsync()
    {
        var name = await dialogs.PromptAsync("New project", "Project name");

        if (name is not null)
        {
            await RunAndRefreshAsync(() => projects.CreateAsync(name));
        }
    }

    public async Task RenameAsync(ProjectCardViewModel? card)
    {
        if (card is null)
        {
            return;
        }

        var name = await dialogs.PromptAsync("Rename project", "Project name", card.Name);

        if (name is not null)
        {
            await RunAndRefreshAsync(() => projects.RenameAsync(card.Id, name));
        }
    }

    public async Task DeleteAsync(ProjectCardViewModel? card)
    {
        if (card is null || !await dialogs.ConfirmAsync("Delete project", $"Delete {card.Name} and its contents?", "Delete"))
        {
            return;
        }

        await RunAndRefreshAsync(() => projects.DeleteAsync(card.Id));
    }

    public async Task OpenAsync(ProjectCardViewModel? card)
    {
        if (card is null)
        {
            return;
        }

        try
        {
            await navigation.OpenProjectAsync(card.Id);
        }
        catch (DomainRuleException exception)
        {
            await dialogs.ShowMessageAsync("Project action failed", exception.Message);
        }
    }

    public async Task OpenProjectSettingsAsync(ProjectCardViewModel? card)
    {
        if (card is not null)
        {
            await navigation.OpenProjectSettingsAsync(card.Id);
        }
    }

    private DataTransferViewModel? CreateTransfer(TransferServices? services)
    {
        if (services is null)
        {
            return null;
        }

        return new DataTransferViewModel(services.Service, projects, dialogs, services.Files, LoadAsync);
    }

    private async Task RunAndRefreshAsync(Func<Task> action)
    {
        try
        {
            await action();
            await LoadAsync();
        }
        catch (DomainRuleException exception)
        {
            await dialogs.ShowMessageAsync("Project action failed", exception.Message);
        }
    }
}