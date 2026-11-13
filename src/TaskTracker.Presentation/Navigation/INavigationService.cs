namespace TaskTracker.Presentation.Navigation;

/// <summary>Changes the page displayed by the application shell.</summary>
public interface INavigationService
{
    Task GoHomeAsync();

    Task OpenProjectAsync(Guid projectId);
}