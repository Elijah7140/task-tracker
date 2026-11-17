using TaskTracker.Core.Search;

namespace TaskTracker.Presentation.Navigation;

/// <summary>Changes the page displayed by the application shell.</summary>
public interface INavigationService
{
    Task GoHomeAsync();

    Task OpenProjectAsync(Guid projectId);

    /// <summary>Opens the search page, remembering the current page for <see cref="ReturnFromSearchAsync"/>.</summary>
    Task OpenSearchAsync();

    /// <summary>Leaves the search page for the page it was opened from, or Home when there is none.</summary>
    Task ReturnFromSearchAsync();

    /// <summary>
    /// Opens the item behind a search result in its current folder. The search page stays open
    /// when the item no longer exists or the user cancels leaving a page with unsaved changes.
    /// </summary>
    Task<SearchOpenOutcome> OpenSearchResultAsync(ItemSearchResult result);

    Task OpenAppSettingsAsync(Guid? returnProjectId = null)
    {
        return Task.CompletedTask;
    }

    Task OpenProjectSettingsAsync(Guid projectId)
    {
        return Task.CompletedTask;
    }
}