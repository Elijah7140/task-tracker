namespace TaskTracker.Presentation.ViewModels;

/// <summary>Root ViewModel for the main window. Hosts whichever page is currently shown.</summary>
public sealed class MainWindowViewModel : ViewModelBase
{
    public string Title => "Task Tracker";
}