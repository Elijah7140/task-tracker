#pragma warning disable xUnit1051
using TaskTracker.Core;
using TaskTracker.Core.Items;
using TaskTracker.Core.Tickets;
using TaskTracker.Infrastructure.Tests.Persistence;

namespace TaskTracker.Infrastructure.Tests.Tickets;

/// <summary>Exercises ticket ordering and writes against real SQLite with fresh contexts.</summary>
public sealed class TicketServiceTests
{
    [Fact]
    public async Task Section_order_uses_sort_order_and_listing_does_not_assign_ranks()
    {
        await using var world = await UndoWorld.CreateAsync();
        var first = await world.Lookups.AddPriorityLevelAsync("First", 1);
        var second = await world.Lookups.AddPriorityLevelAsync("Hotfix", 7);
        var third = await world.Lookups.AddPriorityLevelAsync("Later", 2);
        var unprioritized = await AddAsync(world, "T-0");
        await AddAsync(world, "T-1", first.Id);
        await AddAsync(world, "T-7", second.Id);
        await AddAsync(world, "T-2", third.Id);
        world.History.Clear();

        var board = await world.Tickets.LoadAsync();

        Assert.Equal(new int?[] { null, 1, 7, 2 }, board.Sections
            .Where(section => section.Items.Count > 0).Select(section => section.Priority?.Number));
        Assert.Null((await world.ReadItemAsync(unprioritized.Id)).TicketRank);
        Assert.False(world.History.CanUndo);
    }

    [Fact]
    public async Task Moving_at_section_edges_assigns_ranks_and_clears_priority_in_no_priority()
    {
        await using var world = await UndoWorld.CreateAsync();
        var level = await world.Lookups.AddPriorityLevelAsync("Hotfix", 7);
        var first = await AddAsync(world, "First");
        var second = await AddAsync(world, "Second", level.Id);
        var third = await AddAsync(world, "Third", level.Id);

        await world.Tickets.MoveAsync(first.Id, new TicketPosition(level.Id, third.Id, After: true));
        var prioritized = await world.Tickets.LoadAsync();
        await world.Tickets.MoveAsync(first.Id, new TicketPosition(null));
        var cleared = await world.Tickets.LoadAsync();

        Assert.Equal([second.Id, third.Id, first.Id], SectionItems(prioritized, level.Id).Select(item => item.Id));
        Assert.Equal(new double?[] { 0, 1, 2 }, SectionItems(prioritized, level.Id).Select(item => item.TicketRank));
        var moved = Assert.Single(SectionItems(cleared, null));
        Assert.Equal(first.Id, moved.Id);
        Assert.Equal(0, moved.TicketRank);
        Assert.Null(moved.PriorityLevelId);
        Assert.Equal(first.SortOrder, moved.SortOrder);
    }

    [Fact]
    public async Task Moving_before_an_anchor_uses_the_full_section_even_when_filtered()
    {
        await using var world = await UndoWorld.CreateAsync();
        var other = await world.Projects.CreateAsync("Other");
        var hidden = await AddAsync(world, "Hidden", projectId: other.Id);
        var visible = await AddAsync(world, "Visible");
        var moving = await AddAsync(world, "Moving");

        await world.Tickets.MoveAsync(moving.Id, new TicketPosition(null, visible.Id));
        var newest = await AddAsync(world, "Newest");
        var filtered = await world.Tickets.LoadAsync(world.Project.Id);
        var all = await world.Tickets.LoadAsync();

        Assert.Equal([moving.Id, visible.Id, newest.Id], SectionItems(filtered, null).Select(item => item.Id));
        Assert.Equal([hidden.Id, moving.Id, visible.Id, newest.Id], SectionItems(all, null).Select(item => item.Id));
        Assert.Null((await world.ReadItemAsync(newest.Id)).TicketRank);
    }

    [Fact]
    public async Task Set_priority_appends_and_each_change_has_one_labelled_undo_step()
    {
        await using var world = await UndoWorld.CreateAsync();
        var level = await world.Lookups.AddPriorityLevelAsync("Hotfix", 7);
        var moving = await AddAsync(world, "Moving");
        var existing = await AddAsync(world, "Existing", level.Id);
        world.History.Clear();
        world.Recorder.Descriptions.Clear();

        Assert.True(await world.Tickets.SetPriorityAsync(moving.Id, level.Id));
        Assert.False(await world.Tickets.SetPriorityAsync(moving.Id, level.Id));
        var appended = await world.Tickets.LoadAsync();
        Assert.True(await world.Tickets.MoveAsync(moving.Id, new TicketPosition(level.Id)));
        Assert.False(await world.Tickets.MoveAsync(moving.Id, new TicketPosition(level.Id)));
        await world.History.UndoAsync();
        var undoMove = await world.Tickets.LoadAsync();
        await world.History.UndoAsync();
        var undoPriority = await world.Tickets.LoadAsync();
        await world.History.RedoAsync();
        await world.History.RedoAsync();

        Assert.Equal(["Set priority of 'Moving'", "Move 'Moving'"], world.Recorder.Descriptions);
        Assert.Equal([existing.Id, moving.Id], SectionItems(appended, level.Id).Select(item => item.Id));
        Assert.Equal([existing.Id, moving.Id], SectionItems(undoMove, level.Id).Select(item => item.Id));
        Assert.Null(Assert.Single(SectionItems(undoPriority, null)).TicketRank);
        Assert.Null(Assert.Single(SectionItems(undoPriority, level.Id)).TicketRank);
        Assert.Equal([moving.Id, existing.Id],
            SectionItems(await world.Tickets.LoadAsync(), level.Id).Select(item => item.Id));
    }

    [Fact]
    public async Task Only_open_numbered_items_in_active_projects_are_tickets()
    {
        await using var world = await UndoWorld.CreateAsync();
        var parent = await world.Items.CreateAsync(world.Project.Id, null, null, "No ticket number");
        var child = await AddAsync(world, "Child", parentId: parent.Id);
        var completed = await AddAsync(world, "Completed");
        var deleted = await AddAsync(world, "Deleted");
        var other = await world.Projects.CreateAsync("Deleted project");
        await AddAsync(world, "Hidden", projectId: other.Id);
        await world.Items.SetCompletedAsync(world.Project.Id, null, completed.Id, true);
        await world.Items.DeleteAsync(world.Project.Id, null, deleted.Id);
        await world.Projects.DeleteAsync(other.Id);

        var visible = SectionItems(await world.Tickets.LoadAsync(), null);

        Assert.Equal(child.Id, Assert.Single(visible).Id);
        await Assert.ThrowsAsync<DomainRuleException>(() => world.Tickets.MoveAsync(child.Id,
            new TicketPosition(null, completed.Id)));
        Assert.Null((await world.ReadItemAsync(child.Id)).TicketRank);
    }

    private static IReadOnlyList<TodoItem> SectionItems(TicketBoard board, Guid? priorityId)
    {
        return board.Sections.Single(section => section.Priority?.Id == priorityId).Items;
    }

    private static async Task<TodoItem> AddAsync(UndoWorld world, string title, Guid? priorityId = null,
        Guid? projectId = null, Guid? parentId = null)
    {
        world.Clock.Advance(TimeSpan.FromSeconds(1));
        var item = await world.Items.CreateAsync(projectId ?? world.Project.Id, null, parentId, title);
        await world.Items.EditAsync(item.Id, new ItemEdit(title, null, title, null, priorityId, null, null, null, null));
        return item;
    }
}