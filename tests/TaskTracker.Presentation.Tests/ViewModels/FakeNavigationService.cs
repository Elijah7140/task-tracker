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

    public Task<SearchOpenOutcome> OpenSearchResultAsync(ItemSearchResult result)
    {
        OpenedResult = result;
        return Task.FromResult(ResultOutcome);
    }
}