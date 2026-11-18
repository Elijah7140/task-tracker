using TaskTracker.Core.Lookups;
using TaskTracker.Core.Search;

namespace TaskTracker.Presentation.Navigation;

/// <summary>Changes the page displayed by the application shell.</summary>
public interface INavigationService
{
    Task GoHomeAsync();

    Task OpenProjectAsync(Guid projectId);

    /// <summary>Opens Tickets using the shell's transient return page.</summary>
    Task OpenTicketsAsync() => Task.CompletedTask;

    /// <summary>Returns to the page behind Tickets.</summary>
    Task ReturnFromTicketsAsync() => Task.CompletedTask;

    /// <summary>Opens a ticket in its current workspace.</summary>
    Task<SearchOpenOutcome> OpenTicketItemAsync(Guid itemId) => Task.FromResult(SearchOpenOutcome.Cancelled);

    /// <summary>Opens Today using the shell's transient return page.</summary>
    Task OpenTodayAsync() => Task.CompletedTask;

    /// <summary>Returns to the page behind Today.</summary>
    Task ReturnFromTodayAsync() => Task.CompletedTask;

    /// <summary>Opens an item from Today in its current workspace.</summary>
    Task<SearchOpenOutcome> OpenTodayItemAsync(Guid itemId) => Task.FromResult(SearchOpenOutcome.Cancelled);

    /// <summary>Pushes back an item displayed by the current transient page.</summary>
    Task PushBackAsync(Guid itemId) => Task.CompletedTask;

    /// <summary>Loads the statuses and priority levels that a transient page's row menus offer.</summary>
    Task<(IReadOnlyList<StatusLevel> Statuses, IReadOnlyList<PriorityLevel> Priorities)> LoadRowLookupsAsync(
        CancellationToken cancellationToken = default)
    {
        return Task.FromResult<(IReadOnlyList<StatusLevel>, IReadOnlyList<PriorityLevel>)>(([], []));
    }

    /// <summary>Sets the status of an item displayed by the current transient page (§7.15).</summary>
    Task SetRowStatusAsync(Guid itemId, Guid? statusId) => Task.CompletedTask;

    /// <summary>Sets the priority of an item displayed by the current transient page (§7.15).</summary>
    Task SetRowPriorityAsync(Guid itemId, Guid? priorityId) => Task.CompletedTask;

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

    /// <summary>
    /// Opens the search page with a saved search applied and run. Opened from the search page it
    /// replaces it, keeping the original return page.
    /// </summary>
    Task OpenSavedSearchAsync(Guid savedSearchId)
    {
        return Task.CompletedTask;
    }

    Task OpenAppSettingsAsync(Guid? returnProjectId = null)
    {
        return Task.CompletedTask;
    }

    Task OpenProjectSettingsAsync(Guid projectId)
    {
        return Task.CompletedTask;
    }
}