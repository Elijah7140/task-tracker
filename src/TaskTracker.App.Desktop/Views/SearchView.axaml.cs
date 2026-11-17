using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.VisualTree;

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

    private void OnResultPointerPressed(object? sender, PointerPressedEventArgs args)
    {
        if (!IsLeftDoubleClick(args))
        {
            return;
        }

        var row = ResultRowUnder(args);

        if (row?.DataContext is SearchResultViewModel result)
        {
            args.Handled = true;
            OpenResult(result);
        }
    }

    private void OnResultKeyDown(object? sender, KeyEventArgs args)
    {
        if (args.Key == Key.Enter)
        {
            args.Handled = true;
            OpenResult(SearchResultsList.SelectedItem as SearchResultViewModel);
        }
    }

    private bool IsLeftDoubleClick(PointerPressedEventArgs args)
    {
        var point = args.GetCurrentPoint(SearchResultsList);
        return args.ClickCount == 2 && point.Properties.PointerUpdateKind == PointerUpdateKind.LeftButtonPressed;
    }

    /// <summary>The result row the pointer is over, or null for empty space in the list.</summary>
    private static ListBoxItem? ResultRowUnder(PointerPressedEventArgs args)
    {
        return (args.Source as Visual)?.GetSelfAndVisualAncestors().OfType<ListBoxItem>().FirstOrDefault();
    }

    private void OpenResult(SearchResultViewModel? result)
    {
        if (DataContext is SearchViewModel search && search.OpenResultCommand.CanExecute(result))
        {
            search.OpenResultCommand.Execute(result);
        }
    }
}