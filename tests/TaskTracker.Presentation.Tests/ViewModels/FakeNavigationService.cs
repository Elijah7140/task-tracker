using TaskTracker.Presentation.Navigation;

namespace TaskTracker.Presentation.Tests.ViewModels;

internal sealed class FakeNavigationService : INavigationService
{
    public Guid? OpenedProjectId { get; private set; }

    public bool WentHome { get; private set; }

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
}