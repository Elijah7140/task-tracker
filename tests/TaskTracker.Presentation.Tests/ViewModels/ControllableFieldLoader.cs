using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>
/// A field loader whose results are released by the test, so tests decide in which order
/// the editors of several items finish loading.
/// </summary>
internal sealed class ControllableFieldLoader : ICustomFieldInputLoader
{
    private readonly Dictionary<Guid, TaskCompletionSource<IReadOnlyList<CustomFieldInputViewModel>>> results = [];
    private readonly Dictionary<Guid, TaskCompletionSource> requests = [];

    public Task<IReadOnlyList<CustomFieldInputViewModel>> LoadAsync(Guid projectId, Guid itemId)
    {
        var result = new TaskCompletionSource<IReadOnlyList<CustomFieldInputViewModel>>();
        results[itemId] = result;
        RequestFor(itemId).TrySetResult();

        return result.Task;
    }

    /// <summary>Completes when the view model has asked for the item's fields.</summary>
    public Task WaitForRequestAsync(Guid itemId)
    {
        return RequestFor(itemId).Task.WaitAsync(TimeSpan.FromSeconds(10));
    }

    /// <summary>Releases the item's load, with no custom fields, and runs the waiting code immediately.</summary>
    public void Complete(Guid itemId)
    {
        results[itemId].SetResult([]);
    }

    private TaskCompletionSource RequestFor(Guid itemId)
    {
        if (!requests.TryGetValue(itemId, out var request))
        {
            request = new TaskCompletionSource();
            requests[itemId] = request;
        }

        return request;
    }
}