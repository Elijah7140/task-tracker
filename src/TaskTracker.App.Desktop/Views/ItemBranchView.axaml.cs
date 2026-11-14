using Avalonia.Controls;

namespace TaskTracker.App.Desktop.Views;

/// <summary>Renders one item and recursively places completed children after open children.</summary>
public sealed partial class ItemBranchView : UserControl
{
    public ItemBranchView()
    {
        InitializeComponent();
    }
}