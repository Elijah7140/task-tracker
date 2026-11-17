using System.Collections.ObjectModel;
using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core;
using TaskTracker.Core.SavedSearches;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// The saved searches shown on Home and on the Search page: open, rename and delete them and,
/// on the Search page, save the current search. Failures appear in <see cref="Error"/>.
/// </summary>
public sealed class SavedSearchListViewModel : ViewModelBase
{
    private readonly SavedSearchService service;
    private readonly IDialogService dialogs;
    private readonly INavigationService navigation;
    private readonly Func<Task<SavedSearchDefinition?>>? currentDefinition;
    private SavedSearchEntryViewModel? selected;
    private string? error;
    private bool isBusy;

    /// <summary>
    /// Creates the list. <paramref name="currentDefinition"/> supplies the search to save and is
    /// null where saving is not offered (Home); it returns null when there is nothing valid to save.
    /// </summary>
    public SavedSearchListViewModel(SavedSearchService service, IDialogService dialogs,
        INavigationService navigation, Func<Task<SavedSearchDefinition?>>? currentDefinition = null)
    {
        this.service = service;
        this.dialogs = dialogs;
        this.navigation = navigation;
        this.currentDefinition = currentDefinition;
        SaveCommand = new AsyncRelayCommand(SaveAsync);
        OpenCommand = new AsyncRelayCommand<SavedSearchEntryViewModel>(OpenAsync);
        RenameCommand = new AsyncRelayCommand<SavedSearchEntryViewModel>(RenameAsync);
        DeleteCommand = new AsyncRelayCommand<SavedSearchEntryViewModel>(DeleteAsync);
    }

    public ObservableCollection<SavedSearchEntryViewModel> Items { get; } = [];

    public ICommand SaveCommand { get; }

    public ICommand OpenCommand { get; }

    /// <summary>Renames the entry given as parameter, or the selected one when none is given.</summary>
    public ICommand RenameCommand { get; }

    /// <summary>Deletes the entry given as parameter, or the selected one when none is given.</summary>
    public ICommand DeleteCommand { get; }

    public bool HasItems => Items.Count > 0;

    public bool HasSelection => Selected is not null;

    /// <summary>The saved search the page was opened from or last saved, if any.</summary>
    public SavedSearchEntryViewModel? Selected
    {
        get => selected;
        private set
        {
            if (SetProperty(ref selected, value))
            {
                OnPropertyChanged(nameof(HasSelection));
            }
        }
    }

    /// <summary>The message for the last failed list, save, rename or delete; null when it worked.</summary>
    public string? Error
    {
        get => error;
        private set => SetProperty(ref error, value);
    }

    /// <summary>Reloads the list, keeping the same entry selected when it still exists.</summary>
    public async Task LoadAsync()
    {
        await RunAsync(ReloadAsync);
    }

    /// <summary>Marks the saved search with this id as the current one.</summary>
    public void Select(Guid? id)
    {
        Selected = Items.FirstOrDefault(entry => entry.Id == id);

        foreach (var entry in Items)
        {
            entry.IsSelected = ReferenceEquals(entry, Selected);
        }
    }

    private async Task ReloadAsync()
    {
        var previousId = Selected?.Id;
        var searches = await service.ListAsync();
        Items.Clear();

        foreach (var search in searches)
        {
            Items.Add(new SavedSearchEntryViewModel(search));
        }

        OnPropertyChanged(nameof(HasItems));
        Select(previousId);
    }

    private async Task SaveAsync()
    {
        if (currentDefinition is null || isBusy)
        {
            return;
        }

        var definition = await currentDefinition();

        if (definition is null)
        {
            return;
        }

        var name = await dialogs.PromptAsync("Save search", "Name", Selected?.Name);

        if (name is not null)
        {
            await RunAsync(() => SaveNamedAsync(name, definition));
        }
    }

    private async Task SaveNamedAsync(string name, SavedSearchDefinition definition)
    {
        var existing = Items.FirstOrDefault(entry => string.Equals(entry.Name, name.Trim(), StringComparison.OrdinalIgnoreCase));

        if (existing is not null && !await ConfirmReplaceAsync(existing))
        {
            return;
        }

        var saved = await service.SaveAsync(name, definition, overwrite: existing is not null);
        Selected = null;
        await ReloadAsync();
        Select(saved.Id);
    }

    private Task<bool> ConfirmReplaceAsync(SavedSearchEntryViewModel existing)
    {
        return dialogs.ConfirmAsync("Replace saved search",
            $"A saved search named '{existing.Name}' already exists. Replace it?", "Replace");
    }

    private async Task OpenAsync(SavedSearchEntryViewModel? entry)
    {
        if (entry is not null)
        {
            await navigation.OpenSavedSearchAsync(entry.Id);
        }
    }

    private async Task RenameAsync(SavedSearchEntryViewModel? entry)
    {
        entry ??= Selected;

        if (entry is null || isBusy)
        {
            return;
        }

        var name = await dialogs.PromptAsync("Rename saved search", "Name", entry.Name);

        if (name is not null)
        {
            await RunAsync(() => RenameAndReloadAsync(entry.Id, name));
        }
    }

    private async Task RenameAndReloadAsync(Guid id, string name)
    {
        await service.RenameAsync(id, name);
        await ReloadAsync();
    }

    private async Task DeleteAndReloadAsync(Guid id)
    {
        await service.DeleteAsync(id);
        await ReloadAsync();
    }

    private async Task DeleteAsync(SavedSearchEntryViewModel? entry)
    {
        entry ??= Selected;

        if (entry is null || isBusy)
        {
            return;
        }

        var message = $"Delete the saved search '{entry.Name}'?";

        if (await dialogs.ConfirmAsync("Delete saved search", message, "Delete"))
        {
            await RunAsync(() => DeleteAndReloadAsync(entry.Id));
        }
    }

    private async Task RunAsync(Func<Task> action)
    {
        isBusy = true;

        try
        {
            await action();
            Error = null;
        }
        catch (DomainRuleException exception)
        {
            Error = exception.Message;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            Error = $"Something went wrong: {exception.Message}";
        }
        finally
        {
            isBusy = false;
        }
    }
}