using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;

namespace TaskTracker.Core.Tests.Items;

/// <summary>Checks when editing a workspace item invalidates its stored ticket position.</summary>
public sealed class TodoItemTicketRankTests
{
    private static readonly TimeProvider Clock = new FakeTimeProvider();

    [Fact]
    public void Editing_the_ticket_number_and_keeping_its_priority_preserves_its_rank()
    {
        var item = CreateRankedTicket();

        item.SetTicketNumber("T-2", Clock);
        item.SetLookups(BuiltInLookups.ChangeId, null, Clock);

        Assert.Equal(2.5, item.TicketRank);
    }

    [Fact]
    public void Clearing_the_ticket_number_discards_its_rank()
    {
        var item = CreateRankedTicket();

        item.SetTicketNumber(" ", Clock);

        Assert.Null(item.TicketRank);
    }

    [Fact]
    public void Changing_priority_discards_the_rank_from_the_previous_section()
    {
        var item = CreateRankedTicket();

        item.SetLookups(null, BuiltInLookups.CriticalId, Clock);

        Assert.Null(item.TicketRank);
    }

    private static TodoItem CreateRankedTicket()
    {
        var item = TodoItem.Create(Guid.NewGuid(), null, null, "Ticket", Clock);
        item.SetTicketNumber("T-1", Clock);
        item.SetTicketRank(2.5);
        return item;
    }
}