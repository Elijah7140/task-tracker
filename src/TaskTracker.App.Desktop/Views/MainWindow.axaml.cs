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
            .Register<SearchViewModel, SearchView>()
            .Register<CalendarViewModel, CalendarView>());
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
        else if (IsCalendarShortcut(args))
        {
            args.Handled = true;
            await shell.OpenCalendarAsync();
        }
        else if (shell.CurrentPage is CalendarViewModel calendar)
        {
            await HandleCalendarKeyAsync(shell, calendar, args);
        }
        else if (args.Key == Key.Escape && shell.CurrentPage is SearchViewModel)
        {
            args.Handled = true;
            await shell.ReturnFromSearchAsync();
        }
    }

    /// <summary>PageUp/PageDown and Escape act on the calendar with no modifiers; Ctrl+Shift+M/W switch views.</summary>
    private static async Task HandleCalendarKeyAsync(
        MainWindowViewModel shell, CalendarViewModel calendar, KeyEventArgs args)
    {
        var hasNoModifiers = args.KeyModifiers == KeyModifiers.None;
        var hasControlShift = args.KeyModifiers == (KeyModifiers.Control | KeyModifiers.Shift);

        if (hasNoModifiers && args.Key == Key.PageUp)
        {
            args.Handled = true;
            await calendar.MoveAsync(-1);
        }
        else if (hasNoModifiers && args.Key == Key.PageDown)
        {
            args.Handled = true;
            await calendar.MoveAsync(1);
        }
        else if (hasNoModifiers && args.Key == Key.Escape)
        {
            args.Handled = true;
            await shell.ReturnFromCalendarAsync();
        }
        else if (hasControlShift && args.Key == Key.M)
        {
            args.Handled = true;
            await calendar.SetWeekAsync(false);
        }
        else if (hasControlShift && args.Key == Key.W)
        {
            args.Handled = true;
            await calendar.SetWeekAsync(true);
        }
    }

    private static bool IsCalendarShortcut(KeyEventArgs args)
    {
        return args.Key == Key.C && args.KeyModifiers == (KeyModifiers.Control | KeyModifiers.Shift);
    }

    private static bool IsSearchShortcut(KeyEventArgs args)
    {
        return args.Key == Key.F && args.KeyModifiers == KeyModifiers.Control;
    }
}