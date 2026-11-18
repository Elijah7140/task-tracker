using TaskTracker.Core.CurrentItem;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class CurrentItemCardViewModelTests
{
    [Fact]
    public async Task Card_without_a_current_item_is_empty_and_cannot_open()
    {
        var card = new CurrentItemCardViewModel(() => Task.FromResult<CurrentItemCard?>(null), _ => Task.CompletedTask);

        await card.LoadAsync();

        Assert.True(card.IsEmpty);
        Assert.False(card.OpenCommand.CanExecute(null));
    }

    [Fact]
    public async Task Card_describes_the_due_date_and_time_in_the_current_culture()
    {
        var card = new CurrentItemCardViewModel(() => Task.FromResult<CurrentItemCard?>(Sample()), _ => Task.CompletedTask);

        await card.LoadAsync();

        Assert.Equal("Due Fri 20 Nov 2026, 2:30 PM", card.DueText);
        Assert.Equal("Billing › dbo", card.AreaPath);
        Assert.False(card.HasDescription);
    }

    [Fact]
    public async Task Open_hides_the_card_and_opens_the_item()
    {
        Guid? opened = null;
        var hidden = false;
        var card = new CurrentItemCardViewModel(() => Task.FromResult<CurrentItemCard?>(Sample()), id =>
        {
            opened = id;
            return Task.CompletedTask;
        });
        card.OpenRequested += () => hidden = true;
        await card.LoadAsync();

        card.OpenCommand.Execute(null);

        Assert.True(hidden);
        Assert.Equal(Sample().Id, opened);
    }

    private static CurrentItemCard Sample()
    {
        return new CurrentItemCard(Guid.Parse("0193a1b2-0000-7000-8000-000000000001"), "Review", "Billing › dbo",
            null, null, new DateOnly(2026, 11, 20), new TimeOnly(14, 30), false, "   ");
    }
}