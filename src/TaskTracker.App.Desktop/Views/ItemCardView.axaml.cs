using Avalonia.Controls;

namespace TaskTracker.App.Desktop.Views;

/// <summary>Shows one top-level item as a card in the workspace grid, with its sub-items listed inside.</summary>
public sealed partial class ItemCardView : UserControl
{
    public ItemCardView()
    {
        InitializeComponent();
    }
}