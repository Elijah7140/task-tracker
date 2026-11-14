namespace TaskTracker.Presentation.ViewModels;

/// <summary>Posts a timer update to the UI owner without referencing a UI framework.</summary>
public interface IUiDispatcher
{
    void Post(Action action);
}