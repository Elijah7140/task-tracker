#pragma warning disable xUnit1051
using TaskTracker.Core;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;

namespace TaskTracker.Infrastructure.Tests.Persistence;

/// <summary><c>ItemService.MoveToPriorityGroupAsync</c>: the card grid's drag and Alt+arrow moves.</summary>
public sealed class ItemPriorityGroupMoveTests
{
    [Fact]
    public async Task Moving_into_another_section_sets_priority_and_position_in_one_undo_step()
    {
        await using var world = await UndoWorld.CreateAsync();
        var first = await world.Items.CreateAsync(world.Project.Id, null, null, "First");
        var second = await world.Items.CreateAsync(world.Project.Id, null, null, "Second");

        await world.Items.MoveToPriorityGroupAsync(world.Project.Id, null, second.Id, BuiltInLookups.HighId, 0);
        var moved = await world.ReadItemAsync(second.Id);
        var pushed = await world.ReadItemAsync(first.Id);

        Assert.Equal(BuiltInLookups.HighId, moved.PriorityLevelId);
        Assert.Equal(0, moved.SortOrder);
        Assert.Equal(1, pushed.SortOrder);
        Assert.Equal("Set priority of 'Second'", world.History.UndoDescription);

        await world.History.UndoAsync();
        var restored = await world.ReadItemAsync(second.Id);

        Assert.Null(restored.PriorityLevelId);
        Assert.Equal(1, restored.SortOrder);
    }

    [Fact]
    public async Task Moving_within_the_same_section_is_labelled_a_move()
    {
        await using var world = await UndoWorld.CreateAsync();
        var first = await world.Items.CreateAsync(world.Project.Id, null, null, "First");
        await world.Items.CreateAsync(world.Project.Id, null, null, "Second");

        await world.Items.MoveToPriorityGroupAsync(world.Project.Id, null, first.Id, null, 1);

        Assert.Equal(1, (await world.ReadItemAsync(first.Id)).SortOrder);
        Assert.Equal("Move 'First'", world.History.UndoDescription);
    }

    [Fact]
    public async Task Moving_a_sub_item_promotes_it_to_the_top_level()
    {
        await using var world = await UndoWorld.CreateAsync();
        var parent = await world.Items.CreateAsync(world.Project.Id, null, null, "Parent");
        var child = await world.Items.CreateAsync(world.Project.Id, null, parent.Id, "Child");

        await world.Items.MoveToPriorityGroupAsync(world.Project.Id, null, child.Id, BuiltInLookups.LowId, 1);
        var promoted = await world.ReadItemAsync(child.Id);

        Assert.Null(promoted.ParentItemId);
        Assert.Equal(1, promoted.SortOrder);
        Assert.Equal(BuiltInLookups.LowId, promoted.PriorityLevelId);
    }

    [Fact]
    public async Task An_archived_priority_is_refused_and_nothing_is_saved()
    {
        await using var world = await UndoWorld.CreateAsync();
        var first = await world.Items.CreateAsync(world.Project.Id, null, null, "First");
        await world.Items.CreateAsync(world.Project.Id, null, null, "Second");
        await world.Lookups.ArchivePriorityLevelAsync(BuiltInLookups.LowId);

        await Assert.ThrowsAsync<DomainRuleException>(() =>
            world.Items.MoveToPriorityGroupAsync(world.Project.Id, null, first.Id, BuiltInLookups.LowId, 1));
        var unchanged = await world.ReadItemAsync(first.Id);

        Assert.Null(unchanged.PriorityLevelId);
        Assert.Equal(0, unchanged.SortOrder);
    }

    [Fact]
    public async Task Changing_priority_clears_the_ticket_rank()
    {
        await using var world = await UndoWorld.CreateAsync();
        var ticket = await world.Items.CreateAsync(world.Project.Id, null, null, "Ticket");
        await world.Items.EditAsync(ticket.Id, new ItemEdit("Ticket", null, "T-1", null, null, null, null, null, null));
        var rankedBefore = (await world.ReadItemAsync(ticket.Id)).TicketRank;

        await world.Items.MoveToPriorityGroupAsync(world.Project.Id, null, ticket.Id, BuiltInLookups.HighId, 0);

        Assert.NotNull(rankedBefore);
        Assert.Null((await world.ReadItemAsync(ticket.Id)).TicketRank);
    }
}