using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Threading;
using Avalonia.VisualTree;

using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Views;

/// <summary>Displays the ticket board and translates shortcut keys on a focused row.</summary>
public sealed partial class TicketsView : UserControl
{
    private readonly TicketDragController drag;

    public TicketsView()
    {
        InitializeComponent();
        drag = new TicketDragController(this);
        AddHandler(KeyDownEvent, OnTicketKeyDown, RoutingStrategies.Tunnel);
    }

    protected override void OnLoaded(RoutedEventArgs args)
    {
        base.OnLoaded(args);
        ProjectFilter.Focus();
    }

    protected override void OnUnloaded(RoutedEventArgs args)
    {
        drag.Cancel();
        base.OnUnloaded(args);
    }

    private async void OnTicketKeyDown(object? sender, KeyEventArgs args)
    {
        if (args.Key == Key.Escape && args.KeyModifiers == KeyModifiers.None && drag.IsDragging)
        {
            drag.Cancel();
            args.Handled = true;
        }
        else if (DataContext is TicketsViewModel page && args.Source is Border { DataContext: TicketRowViewModel row })
        {
            await HandleRowKeyAsync(args, page, row);
        }
    }

    private async Task HandleRowKeyAsync(KeyEventArgs args, TicketsViewModel page, TicketRowViewModel row)
    {
        if (args.KeyModifiers == KeyModifiers.Alt && args.Key is Key.Up or Key.Down)
        {
            args.Handled = true;
            await page.MoveOneAsync(row, down: args.Key == Key.Down);
            RestoreRowFocus(row.Id);
        }
        else if (args.KeyModifiers == KeyModifiers.None && args.Key == Key.Enter && row.OpenCommand.CanExecute(null))
        {
            args.Handled = true;
            row.OpenCommand.Execute(null);
        }
    }

    internal void RestoreRowFocus(Guid id)
    {
        Dispatcher.UIThread.Post(() =>
        {
            if (!IsLoaded || TopLevel.GetTopLevel(this)?.FocusManager?.GetFocusedElement() is Control focused
                && (focused.DataContext is not TicketRowViewModel ticket || ticket.Id != id))
            {
                return;
            }

            var row = this.GetVisualDescendants().OfType<Border>()
                .SingleOrDefault(control => control.Classes.Contains("ticketRow") &&
                    control.DataContext is TicketRowViewModel rowModel && rowModel.Id == id);
            row?.BringIntoView();
            row?.Focus();
        }, DispatcherPriority.Loaded);
    }
}