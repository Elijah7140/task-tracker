using Avalonia.Controls;
using Avalonia.Input;

namespace TaskTracker.App.Desktop.Views;

/// <summary>A borderless window that shows the current item's card next to the tray icon.</summary>
public partial class CurrentItemCardWindow : Window
{
    public CurrentItemCardWindow()
    {
        InitializeComponent();
    }

    /// <summary>Escape hides the card, like clicking elsewhere does.</summary>
    protected override void OnKeyDown(KeyEventArgs args)
    {
        if (args.Key == Key.Escape)
        {
            args.Handled = true;
            Hide();
            return;
        }

        base.OnKeyDown(args);
    }
}