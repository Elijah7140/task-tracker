using TaskTracker.Core.Search;
using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.Tests.ViewModels;

internal sealed class FakeNavigationService : INavigationService
{
    public Guid? OpenedProjectId { get; private set; }

    public bool WentHome { get; private set; }

    public bool OpenedSearch { get; private set; }

    public bool ReturnedFromSearch { get; private set; }

    public ItemSearchResult? OpenedResult { get; private set; }

    public SearchOpenOutcome ResultOutcome { get; set; } = SearchOpenOutcome.Opened;

    public Task GoHomeAsync()
    {
        WentHome = true;
        return Task.CompletedTask;
    }

    public Task OpenProjectAsync(Guid projectId)
    {
        OpenedProjectId = projectId;
        return Task.CompletedTask;
    }

    public Task OpenSearchAsync()
    {
        OpenedSearch = true;
        return Task.CompletedTask;
    }

    public Task ReturnFromSearchAsync()
    {
        ReturnedFromSearch = true;
        return Task.CompletedTask;
    }

    public bool OpenedTrash { get; private set; }

    public bool ReturnedFromTrash { get; private set; }

    public Task OpenTrashAsync()
    {
        OpenedTrash = true;
        return Task.CompletedTask;
    }

    public Task ReturnFromTrashAsync()
    {
        ReturnedFromTrash = true;
        return Task.CompletedTask;
    }

    public bool OpenedCalendar { get; private set; }

    public bool ReturnedFromCalendar { get; private set; }

    public Guid? OpenedCalendarItemId { get; private set; }

    public int CalendarItemRequests { get; private set; }

    /// <summary>When set, calendar item requests stay pending until the test completes it.</summary>
    public TaskCompletionSource<SearchOpenOutcome>? CalendarItemGate { get; set; }

    public SearchOpenOutcome CalendarItemOutcome { get; set; } = SearchOpenOutcome.Opened;

    public Task OpenCalendarAsync()
    {
        OpenedCalendar = true;
        return Task.CompletedTask;
    }

    public Task ReturnFromCalendarAsync()
    {
        ReturnedFromCalendar = true;
        return Task.CompletedTask;
    }

    public async Task<SearchOpenOutcome> OpenCalendarItemAsync(Guid itemId)
    {
        OpenedCalendarItemId = itemId;
        CalendarItemRequests++;

        if (CalendarItemGate is not null)
        {
            return await CalendarItemGate.Task;
        }

        return CalendarItemOutcome;
    }

    public List<Guid> OpenedSavedSearchIds { get; } = [];

    public Task OpenSavedSearchAsync(Guid savedSearchId)
    {
        OpenedSavedSearchIds.Add(savedSearchId);
        return Task.CompletedTask;
    }

    public int ResultRequests { get; private set; }

    /// <summary>When set, search result requests stay pending until the test completes it.</summary>
    public TaskCompletionSource<SearchOpenOutcome>? ResultGate { get; set; }

    public async Task<SearchOpenOutcome> OpenSearchResultAsync(ItemSearchResult result)
    {
        OpenedResult = result;
        ResultRequests++;

        if (ResultGate is not null)
        {
            return await ResultGate.Task;
        }

        return ResultOutcome;
    }
}