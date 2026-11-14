using Avalonia.Controls;
using Avalonia.Input;

using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Views;

/// <summary>Home screen view.</summary>
public sealed partial class HomeView : UserControl
{
    public HomeView()
    {
        InitializeComponent();
    }

    private async void OnCardPointerPressed(object? sender, PointerPressedEventArgs args)
    {
        if (args.ClickCount == 2 && sender is Border { DataContext: ProjectCardViewModel card })
        {
            await OpenCardAsync(card);
        }
    }

    private async void OnCardKeyDown(object? sender, KeyEventArgs args)
    {
        if (args.Key == Key.Enter && sender is Border { DataContext: ProjectCardViewModel card })
        {
            args.Handled = true;
            await OpenCardAsync(card);
        }
    }

    private Task OpenCardAsync(ProjectCardViewModel card)
    {
        return DataContext is HomeViewModel home ? home.OpenAsync(card) : Task.CompletedTask;
    }
}