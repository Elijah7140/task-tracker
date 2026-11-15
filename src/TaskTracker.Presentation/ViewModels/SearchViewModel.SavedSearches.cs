using TaskTracker.Core.SavedSearches;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Saving the current search and opening a saved one on the search page.</summary>
public sealed partial class SearchViewModel
{
    /// <summary>The saved searches list, or null when saving is not available (no parser or service).</summary>
    public SavedSearchListViewModel? SavedSearches { get; }

    public bool HasSavedSearchSupport => SavedSearches is not null;

    /// <summary>
    /// Restores a saved search's scope, completed switch, text and filters, then runs it. A saved
    /// search that no longer fits (an archived field, a deleted choice or project) shows the
    /// reason in <see cref="Error"/> instead of results.
    /// </summary>
    public async Task OpenSavedAsync(SavedSearch saved)
    {
        Error = null;
        SelectScopeFor(saved);
        IncludeSubfolders = saved.IncludeSubfolders;
        IncludeCompleted = saved.IncludeCompleted;
        await ScopeRefreshTask;
        await LoadSavedSearchesAsync();
        SavedSearches?.Select(saved.Id);
        TypeQueryText(saved.QueryText);

        if (await ApplyQueryTextAsync(showDisplayText: true))
        {
            await RunAsync();
        }

        if (Error is not null)
        {
            Error = $"The saved search '{saved.Name}' can't be run. {Error}";
        }
    }

    private SavedSearchListViewModel? CreateSavedSearchList(SavedSearchService? service, IDialogService? dialogs)
    {
        if (service is null || dialogs is null || parser is null)
        {
            return null;
        }

        return new SavedSearchListViewModel(service, dialogs, navigation, CreateDefinitionAsync);
    }

    private async Task LoadSavedSearchesAsync()
    {
        if (SavedSearches is not null)
        {
            await SavedSearches.LoadAsync();
        }
    }

    /// <summary>The search as it would run now, in stable form; null (with an error shown) when the text is invalid.</summary>
    private async Task<SavedSearchDefinition?> CreateDefinitionAsync()
    {
        await ScopeRefreshTask;
        var parsed = await ParseAsync(QueryText);

        if (!parsed.Succeeded)
        {
            Error = DescribeErrors(QueryText, parsed);
            return null;
        }

        Error = null;
        var includeCompleted = IncludeCompleted || parsed.ImpliesIncludeCompleted;
        return new SavedSearchDefinition(parsed.StableText, CurrentScope(), includeCompleted);
    }

    private void SelectScopeFor(SavedSearch saved)
    {
        var kind = saved.ScopeKind switch
        {
            SavedSearchScopeKind.Project => SearchScopeKind.Project,
            SavedSearchScopeKind.Folder when saved.FolderId is null => SearchScopeKind.Root,
            SavedSearchScopeKind.Folder => SearchScopeKind.Folder,
            _ => SearchScopeKind.AllProjects
        };
        var option = ScopeOptions.FirstOrDefault(candidate => candidate.Kind == kind);

        if (option is not null)
        {
            SelectedScope = option;
        }
    }
}