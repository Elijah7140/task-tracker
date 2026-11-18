using Avalonia;
using Avalonia.Controls;

using TaskTracker.App.Desktop.Views;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tray;

/// <summary>
/// Shows the current item's card next to the tray icon when the icon is clicked, and hides it
/// when the user clicks elsewhere, presses Escape, or clicks the icon again (§7.17).
/// </summary>
internal sealed class CurrentItemCardPopup : IDisposable
{
    /// <summary>A click this soon after the card lost focus is the click that closed it.</summary>
    private static readonly TimeSpan ReopenGuard = TimeSpan.FromMilliseconds(400);

    private readonly CurrentItemCardViewModel card;
    private readonly TimeProvider clock;
    private CurrentItemCardWindow? window;
    private PixelPoint? anchor;
    private long hiddenAt;

    public CurrentItemCardPopup(CurrentItemCardViewModel card, TimeProvider clock)
    {
        this.card = card;
        this.clock = clock;
        card.OpenRequested += Hide;
    }

    /// <summary>The card's window once it has been shown; null before the first click.</summary>
    internal CurrentItemCardWindow? Window => window;

    /// <summary>Shows the card, or hides it when it is already showing.</summary>
    public async Task ToggleAsync()
    {
        if (window?.IsVisible == true)
        {
            Hide();
            return;
        }

        if (WasJustHidden())
        {
            return;
        }

        anchor = CursorPosition.TryGet();
        await card.LoadAsync();
        Show();
    }

    public void Hide()
    {
        if (window?.IsVisible != true)
        {
            return;
        }

        hiddenAt = clock.GetTimestamp();
        window.Hide();
    }

    private void Show()
    {
        var popup = window ??= CreateWindow();
        popup.Show();
        Place(popup);
        popup.Activate();
    }

    private CurrentItemCardWindow CreateWindow()
    {
        var popup = new CurrentItemCardWindow { DataContext = card };
        popup.Deactivated += (_, _) => Hide();
        popup.SizeChanged += (_, _) => Place(popup);
        return popup;
    }

    /// <summary>Puts the card by the tray icon, inside the working area of the icon's screen.</summary>
    private void Place(CurrentItemCardWindow popup)
    {
        var screens = popup.Screens;
        var screen = (anchor is PixelPoint point ? screens.ScreenFromPoint(point) : null) ?? screens.Primary;
        if (screen is null)
        {
            return;
        }

        var size = PixelSize.FromSize(popup.FrameSize ?? popup.ClientSize, screen.Scaling);
        popup.Position = TrayPopupPlacement.Place(screen.WorkingArea, size, anchor);
    }

    private bool WasJustHidden()
    {
        return hiddenAt != 0 && clock.GetElapsedTime(hiddenAt) < ReopenGuard;
    }

    public void Dispose()
    {
        card.OpenRequested -= Hide;
        window?.Close();
        window = null;
    }
}