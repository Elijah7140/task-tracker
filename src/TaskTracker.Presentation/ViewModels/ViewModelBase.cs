using CommunityToolkit.Mvvm.ComponentModel;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>Base class for every ViewModel; provides property-change notification.</summary>
public abstract class ViewModelBase : ObservableObject;