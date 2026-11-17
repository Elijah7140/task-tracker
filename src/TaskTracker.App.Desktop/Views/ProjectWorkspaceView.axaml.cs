using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Threading;
using Avalonia.VisualTree;

using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Views;

/// <summary>Three-pane project workspace view.</summary>
public sealed partial class ProjectWorkspaceView : UserControl
{
    private readonly ItemDragController itemDrag;

    public ProjectWorkspaceView()
    {
        InitializeComponent();
        itemDrag = new ItemDragController(this);
    }

    internal ScrollViewer ItemScrollViewer => ItemsScrollViewer;

    /// <summary>
    /// Puts keyboard focus in the quick-add box when the workspace opens. Without a focused
    /// element inside the view, its key bindings (Ctrl+N, Space, Delete…) never fire.
    /// </summary>
    protected override void OnLoaded(RoutedEventArgs eventArgs)
    {
        base.OnLoaded(eventArgs);
        if (DataContext is ProjectWorkspaceViewModel workspace)
        {
            workspace.ItemMoveCompleted += OnItemMoveCompleted;
        }

        QuickAddBox.Focus();
    }

    protected override void OnUnloaded(RoutedEventArgs eventArgs)
    {
        if (DataContext is ProjectWorkspaceViewModel workspace)
        {
            workspace.ItemMoveCompleted -= OnItemMoveCompleted;
        }

        base.OnUnloaded(eventArgs);
    }

    private void OnItemMoveCompleted()
    {
        Dispatcher.UIThread.Post(FocusSelectedRow, DispatcherPriority.Loaded);
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

    private async void OnFocusKeyDown(object? sender, KeyEventArgs eventArgs)
    {
        if (TryCancelDrag(eventArgs) || TryFocusQuickAdd(eventArgs) || TryFocusTitleEditor(eventArgs))
        {
            return;
        }

        var itemMove = StartItemMoveShortcut(eventArgs);

        if (itemMove is not null)
        {
            await itemMove;
        }
    }

    private bool TryCancelDrag(KeyEventArgs eventArgs)
    {
        if (eventArgs.Key != Key.Escape || !itemDrag.IsDragging)
        {
            return false;
        }

        itemDrag.Cancel();
        eventArgs.Handled = true;
        return true;
    }

    private bool TryFocusQuickAdd(KeyEventArgs eventArgs)
    {
        var isCtrlN = eventArgs.Key == Key.N && eventArgs.KeyModifiers.HasFlag(KeyModifiers.Control) &&
            !eventArgs.KeyModifiers.HasFlag(KeyModifiers.Shift);

        if (!isCtrlN)
        {
            return false;
        }

        QuickAddBox.Focus();
        eventArgs.Handled = true;
        return true;
    }

    private bool TryFocusTitleEditor(KeyEventArgs eventArgs)
    {
        if (eventArgs.Key != Key.F2 || !EditorTitleBox.IsVisible)
        {
            return false;
        }

        EditorTitleBox.Focus();
        EditorTitleBox.SelectAll();
        eventArgs.Handled = true;
        return true;
    }

    /// <summary>
    /// Starts the move for Alt+→ (indent), Alt+← (outdent) or Ctrl+Shift+L (Move to…) and marks
    /// the key handled before the move awaits anything. Returns null for any other key.
    /// </summary>
    private Task? StartItemMoveShortcut(KeyEventArgs eventArgs)
    {
        if (DataContext is not ProjectWorkspaceViewModel workspace)
        {
            return null;
        }

        var move = ChooseItemMove(eventArgs, workspace);
        eventArgs.Handled = move is not null;
        return move;
    }

    private static Task? ChooseItemMove(KeyEventArgs eventArgs, ProjectWorkspaceViewModel workspace)
    {
        var modifiers = eventArgs.KeyModifiers;

        if (eventArgs.Key == Key.L && modifiers.HasFlag(KeyModifiers.Control) &&
            modifiers.HasFlag(KeyModifiers.Shift))
        {
            return workspace.MoveSelectedToAreaAsync();
        }

        if (eventArgs.Key == Key.Right && modifiers.HasFlag(KeyModifiers.Alt))
        {
            return workspace.IndentSelectedAsync();
        }

        if (eventArgs.Key == Key.Left && modifiers.HasFlag(KeyModifiers.Alt))
        {
            return workspace.OutdentSelectedAsync();
        }

        return null;
    }

    /// <summary>
    /// Scrolls the selected row into view and focuses its title button, so keyboard use can
    /// continue after a move rebuilt the rows. Each row has an open and a finished title
    /// button; only the effectively visible one can take focus.
    /// </summary>
    internal void FocusSelectedRow()
    {
        var title = FindVisibleSelectedTitleButton();

        if (title is null)
        {
            return;
        }

        var row = title.GetVisualAncestors().OfType<Border>()
            .FirstOrDefault(border => border.Classes.Contains("itemRow"));
        ((Control?)row ?? title).BringIntoView();
        title.Focus();
    }

    private Button? FindVisibleSelectedTitleButton()
    {
        return this.GetVisualDescendants().OfType<Button>().FirstOrDefault(IsVisibleSelectedTitleButton);
    }

    private static bool IsVisibleSelectedTitleButton(Button button)
    {
        return button.DataContext is ItemRowViewModel { IsSelected: true } row &&
            button.Command == row.SelectCommand &&
            button.IsEffectivelyVisible;
    }
}