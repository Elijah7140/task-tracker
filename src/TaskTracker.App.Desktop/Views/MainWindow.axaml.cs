using Avalonia.Controls;

using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Views;

public sealed partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        DataTemplates.Add(new ViewLocator()
            .Register<HomeViewModel, HomeView>()
            .Register<AppSettingsViewModel, AppSettingsView>()
            .Register<ProjectSettingsViewModel, ProjectSettingsView>()
            .Register<ProjectWorkspaceViewModel, ProjectWorkspaceView>());
    }
}