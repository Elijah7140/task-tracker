using Avalonia.Controls;
using Avalonia.Interactivity;

namespace TaskTracker.App.Desktop.Views;

/// <summary>Trash page: lists deletion batches; every action is a ViewModel command.</summary>
public sealed partial class TrashView : UserControl
{
    public TrashView()
    {
        InitializeComponent();
    }

    /// <summary>Focuses the page itself, so Escape and other keys reach the window without a click first.</summary>
    protected override void OnLoaded(RoutedEventArgs args)
    {
        base.OnLoaded(args);
        TrashRoot.Focus();
    }
}