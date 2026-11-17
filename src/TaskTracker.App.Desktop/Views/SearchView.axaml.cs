using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;

using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Views;

/// <summary>Search form and result interactions.</summary>
public sealed partial class SearchView : UserControl
{
    public SearchView()
    {
        InitializeComponent();
        SearchResultsList.AddHandler(KeyDownEvent, OnResultKeyDown, RoutingStrategies.Bubble, true);
        SearchResultsList.AddHandler(PointerPressedEvent, OnResultPointerPressed, RoutingStrategies.Bubble, true);
    }

    protected override void OnLoaded(RoutedEventArgs args)
    {
        base.OnLoaded(args);
        SearchTextBox.Focus();
    }

    private async void OnResultPointerPressed(object? sender, PointerPressedEventArgs args)
    {
        if (args.ClickCount == 2)
        {
            args.Handled = true;
            await OpenSelectedAsync();
        }
    }

    private async void OnResultKeyDown(object? sender, KeyEventArgs args)
    {
        if (args.Key == Key.Enter)
        {
            args.Handled = true;
            await OpenSelectedAsync();
        }
    }

    private Task OpenSelectedAsync()
    {
        return DataContext is SearchViewModel search && SearchResultsList.SelectedItem is SearchResultViewModel row
            ? search.OpenResultAsync(row)
            : Task.CompletedTask;
    }
}