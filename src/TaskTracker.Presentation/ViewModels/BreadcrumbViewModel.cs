using CommunityToolkit.Mvvm.Input;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>A navigable segment of the workspace breadcrumb.</summary>
public sealed class BreadcrumbViewModel
{
    public BreadcrumbViewModel(string name, Func<Task> navigate, bool isCurrent = false, bool hasSeparator = false)
    {
        Name = name;
        NavigateCommand = new AsyncRelayCommand(navigate);
        IsCurrent = isCurrent;
        HasSeparator = hasSeparator;
    }

    public string Name { get; }

    public bool IsCurrent { get; }

    public bool HasSeparator { get; }

    public IAsyncRelayCommand NavigateCommand { get; }
}