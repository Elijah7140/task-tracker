using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;

using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Views;

/// <summary>Three-pane project workspace view.</summary>
public sealed partial class ProjectWorkspaceView : UserControl
{
    public ProjectWorkspaceView()
    {
        InitializeComponent();
    }

    /// <summary>
    /// Puts keyboard focus in the quick-add box when the workspace opens. Without a focused
    /// element inside the view, its key bindings (Ctrl+N, Space, Delete…) never fire.
    /// </summary>
    protected override void OnLoaded(RoutedEventArgs eventArgs)
    {
        base.OnLoaded(eventArgs);
        QuickAddBox.Focus();
    }

    private async void OnFolderSelectionChanged(object? sender, SelectionChangedEventArgs eventArgs)
    {
        if (DataContext is ProjectWorkspaceViewModel workspace &&
            sender is TreeView { SelectedItem: FolderNodeViewModel folder } &&
            workspace.SelectedFolder != folder)
        {
            await workspace.SelectAreaAsync(folder);
        }
    }

    private void OnFocusKeyDown(object? sender, KeyEventArgs eventArgs)
    {
        var control = eventArgs.KeyModifiers.HasFlag(KeyModifiers.Control);

        if (control && eventArgs.Key == Key.N &&
            !eventArgs.KeyModifiers.HasFlag(KeyModifiers.Shift))
        {
            QuickAddBox.Focus();
        }
        else if (eventArgs.Key == Key.F2 && EditorTitleBox.IsVisible)
        {
            EditorTitleBox.Focus();
            EditorTitleBox.SelectAll();
        }
        else
        {
            return;
        }

        eventArgs.Handled = true;
    }
}