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
    /// Opens the calendar and remembers the page to return to. Opened from the search page, it
    /// remembers the page search was opened from, so Back never lands on a closed search.
    /// </summary>
    Task OpenCalendarAsync();

    /// <summary>Returns from the calendar to its originating page.</summary>
    Task ReturnFromCalendarAsync();

    /// <summary>
    /// Opens the trash and remembers the page to return to, with the same single-return-page
    /// rule as search and the calendar.
    /// </summary>
    Task OpenTrashAsync();

    /// <summary>
    /// Returns from the trash to its originating page. After a restore the page behind is
    /// reloaded first, which asks its unsaved-changes guard; cancelling that stays in the trash.
    /// </summary>
    Task ReturnFromTrashAsync();

    /// <summary>
    /// Opens the current workspace folder of a calendar item. The calendar stays open when the
    /// item no longer exists, the user cancels leaving a page with unsaved changes, or the
    /// calendar was left while the request was pending.
    /// </summary>
    Task<SearchOpenOutcome> OpenCalendarItemAsync(Guid itemId);

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