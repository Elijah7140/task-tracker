using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Threading;

using Microsoft.Extensions.Time.Testing;

using TaskTracker.App.Desktop.Tray;
using TaskTracker.Core.CurrentItem;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop.Tests.Tray;

/// <summary>Checks that tray clicks show and hide the current item's card.</summary>
public sealed class CurrentItemCardPopupTests
{
    [AvaloniaFact]
    public async Task Clicking_the_icon_shows_the_card_and_clicking_again_hides_it()
    {
        using var popup = CreatePopup(new FakeTimeProvider());

        await popup.ToggleAsync();
        var shown = popup.Window?.IsVisible;
        await popup.ToggleAsync();

        Assert.True(shown);
        Assert.False(popup.Window?.IsVisible);
    }

    [AvaloniaFact]
    public async Task Escape_hides_the_card()
    {
        using var popup = CreatePopup(new FakeTimeProvider());
        await popup.ToggleAsync();
        var window = popup.Window!;

        HeadlessInput.Press(window, Key.Escape);

        Assert.False(window.IsVisible);
    }

    [AvaloniaFact]
    public async Task Click_that_closed_the_card_does_not_reopen_it_but_a_later_click_does()
    {
        var clock = new FakeTimeProvider();
        using var popup = CreatePopup(clock);
        await popup.ToggleAsync();
        popup.Hide();

        await popup.ToggleAsync();
        var reopenedAtOnce = popup.Window!.IsVisible;
        clock.Advance(TimeSpan.FromSeconds(1));
        await popup.ToggleAsync();

        Assert.False(reopenedAtOnce);
        Assert.True(popup.Window.IsVisible);
    }

    private static CurrentItemCardPopup CreatePopup(TimeProvider clock)
    {
        var card = new CurrentItemCardViewModel(() => Task.FromResult<CurrentItemCard?>(null), _ => Task.CompletedTask);
        Dispatcher.UIThread.RunJobs();
        return new CurrentItemCardPopup(card, clock);
    }
}