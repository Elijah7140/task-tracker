using Avalonia.Controls;
using Avalonia.Input;

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
            .Register<ProjectWorkspaceViewModel, ProjectWorkspaceView>()
            .Register<SearchViewModel, SearchView>());
        KeyDown += OnKeyDown;
    }

    private async void OnKeyDown(object? sender, KeyEventArgs args)
    {
        if (DataContext is not MainWindowViewModel shell)
        {
            return;
        }

        try
        {
            await HandleKeyAsync(shell, args);
        }
        catch (Exception exception)
        {
            await shell.ReportUnexpectedErrorAsync(exception);
        }
    }

    private static async Task HandleKeyAsync(MainWindowViewModel shell, KeyEventArgs args)
    {
        if (IsSearchShortcut(args))
        {
            args.Handled = true;
            await shell.OpenSearchAsync();
        }
        else if (args.Key == Key.Escape && shell.CurrentPage is SearchViewModel)
        {
            args.Handled = true;
            await shell.ReturnFromSearchAsync();
        }
    }

    private static bool IsSearchShortcut(KeyEventArgs args)
    {
        return args.Key == Key.F && args.KeyModifiers == KeyModifiers.Control;
    }
}