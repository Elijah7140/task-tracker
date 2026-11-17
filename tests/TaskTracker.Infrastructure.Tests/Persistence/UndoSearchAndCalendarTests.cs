#pragma warning disable xUnit1051
using TaskTracker.Core.Calendar;
using TaskTracker.Core.Items;

namespace TaskTracker.Infrastructure.Tests.Persistence;

/// <summary>Full-text search and the calendar must see undone and redone state.</summary>
public sealed class UndoSearchAndCalendarTests
{
    private static readonly DateOnly OriginalDay = new(2026, 11, 16);
    private static readonly DateOnly MovedDay = new(2026, 11, 20);

    [Fact]
    public async Task Search_finds_the_old_title_after_undo_and_the_new_title_after_redo()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Alpha");
        await world.Items.EditAsync(item.Id, new ItemEdit("Bravo", null, null, null, null, null, null, null, null));

        await world.History.UndoAsync();

        Assert.Equal(["Alpha"], await world.SearchTitlesAsync("Alpha"));
        Assert.Empty(await world.SearchTitlesAsync("Bravo"));

        await world.History.RedoAsync();

        Assert.Equal(["Bravo"], await world.SearchTitlesAsync("Bravo"));
        Assert.Empty(await world.SearchTitlesAsync("Alpha"));
    }

    [Fact]
    public async Task Search_loses_an_undone_creation_and_finds_a_redone_one()
    {
        await using var world = await UndoWorld.CreateAsync();
        await world.Items.CreateAsync(world.Project.Id, null, null, "Findable");

        await world.History.UndoAsync();

        Assert.Empty(await world.SearchTitlesAsync("Findable"));

        await world.History.RedoAsync();

        Assert.Equal(["Findable"], await world.SearchTitlesAsync("Findable"));
    }

    [Fact]
    public async Task Search_finds_an_item_again_after_its_deletion_is_undone()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Findable");
        await world.Items.DeleteAsync(world.Project.Id, null, item.Id);

        Assert.Empty(await world.SearchTitlesAsync("Findable"));

        await world.History.UndoAsync();

        Assert.Equal(["Findable"], await world.SearchTitlesAsync("Findable"));
    }

    [Fact]
    public async Task Calendar_shows_the_old_due_date_after_undo_and_the_new_one_after_redo()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await CreateDueItemAsync(world);
        await world.Rescheduler.MoveDueAsync(item.Id, MovedDay, null);

        await world.History.UndoAsync();

        Assert.Equal(OriginalDay, await FirstEntryDateAsync(world));
        Assert.Equal("Reschedule 'Due'", world.Recorder.Descriptions[^1]);

        await world.History.RedoAsync();

        Assert.Equal(MovedDay, await FirstEntryDateAsync(world));
    }

    [Fact]
    public async Task Calendar_shows_the_old_block_after_undoing_a_schedule_move()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Block");
        var start = new DateTime(2026, 11, 16, 9, 0, 0, DateTimeKind.Unspecified);
        var edit = new ItemEdit("Block", null, null, null, null, null, null, start, start.AddHours(1));
        await world.Items.EditAsync(item.Id, edit);
        await world.Rescheduler.MoveScheduleAsync(item.Id, start.AddDays(2));

        await world.History.UndoAsync();

        var restored = await world.ReadItemAsync(item.Id);
        Assert.Equal(start, restored.ScheduledStart);
        Assert.Equal(start.AddHours(1), restored.ScheduledEnd);
        Assert.Equal(OriginalDay, await FirstEntryDateAsync(world));

        await world.History.RedoAsync();

        Assert.Equal(start.AddDays(2), (await world.ReadItemAsync(item.Id)).ScheduledStart);
    }

    private static async Task<TodoItem> CreateDueItemAsync(UndoWorld world)
    {
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Due");
        var edit = new ItemEdit("Due", null, null, null, null, OriginalDay, null, null, null);
        await world.Items.EditAsync(item.Id, edit);
        return item;
    }

    private static async Task<DateOnly> FirstEntryDateAsync(UndoWorld world)
    {
        var query = new CalendarQuery(world.Project.Id, new DateOnly(2026, 11, 1), new DateOnly(2026, 12, 1), false);
        var entries = await world.CalendarQueries.LoadAsync(query);
        return entries.OrderBy(entry => entry.Date).First().Date;
    }
}