namespace TaskTracker.Presentation.Navigation;

/// <summary>Changes the page displayed by the application shell.</summary>
public interface INavigationService
{
    Task GoHomeAsync();

    Task OpenProjectAsync(Guid projectId);

    Task OpenAppSettingsAsync(Guid? returnProjectId = null)
    {
        return Task.CompletedTask;
    }

    Task OpenProjectSettingsAsync(Guid projectId)
    {
        return Task.CompletedTask;
    }
}