#pragma warning disable xUnit1051
using Microsoft.EntityFrameworkCore;

using TaskTracker.Core;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;

namespace TaskTracker.Infrastructure.Tests.Persistence;

/// <summary>Conflicts, purged deletions, failed steps and operations that are deliberately not undoable.</summary>
public sealed class UndoRefusalTests
{
    [Fact]
    public async Task Undo_is_refused_when_the_item_changed_since()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Original");
        await world.Items.EditAsync(item.Id, Plain("Edited"));
        await RenameBehindTheHistoryAsync(world, item.Id, "External");

        var error = await Assert.ThrowsAsync<DomainRuleException>(() => world.History.UndoAsync());

        Assert.Equal("This item changed since; can't undo.", error.Message);
        Assert.Equal("External", (await world.ReadItemAsync(item.Id)).Title);
        Assert.True(world.History.CanUndo);
        Assert.False(world.History.CanRedo);
    }

    [Fact]
    public async Task Redo_is_refused_when_the_item_changed_since()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Original");
        await world.Items.EditAsync(item.Id, Plain("Edited"));
        await world.History.UndoAsync();
        await RenameBehindTheHistoryAsync(world, item.Id, "External");

        var error = await Assert.ThrowsAsync<DomainRuleException>(() => world.History.RedoAsync());

        Assert.Equal("This item changed since; can't redo.", error.Message);
        Assert.True(world.History.CanRedo);
    }

    [Fact]
    public async Task Undoing_a_deletion_whose_batch_was_purged_is_refused_with_a_clear_message()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Gone");
        var batchId = await world.Items.DeleteAsync(world.Project.Id, null, item.Id);
        await world.Trash.PurgeAsync(batchId);

        var error = await Assert.ThrowsAsync<DomainRuleException>(() => world.History.UndoAsync());

        Assert.Equal("This item was permanently deleted since; can't undo.", error.Message);
        Assert.False(await world.ItemExistsAsync(item.Id));
        Assert.True(world.History.CanUndo);
    }

    [Fact]
    public async Task A_refused_step_leaves_every_row_untouched_and_nothing_tracked()
    {
        await using var world = await UndoWorld.CreateAsync();
        var parent = await world.Items.CreateAsync(world.Project.Id, null, null, "Parent");
        var child = await world.Items.CreateAsync(world.Project.Id, null, parent.Id, "Child");
        await world.Items.SetCompletedAsync(world.Project.Id, null, child.Id, true);
        await RenameBehindTheHistoryAsync(world, parent.Id, "External");
        var before = await world.SnapshotAsync();

        await Assert.ThrowsAsync<DomainRuleException>(() => world.History.UndoAsync());

        Assert.Equal(before, await world.SnapshotAsync());
        Assert.NotNull((await world.ReadItemAsync(child.Id)).CompletedAtUtc);

        await world.Items.EditAsync(child.Id, Plain("Child renamed"));

        Assert.Equal("Child renamed", (await world.ReadItemAsync(child.Id)).Title);
        Assert.Equal("External", (await world.ReadItemAsync(parent.Id)).Title);
    }

    [Fact]
    public async Task A_new_action_after_undo_clears_redo()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        await world.Items.EditAsync(item.Id, Plain("Edited"));
        await world.History.UndoAsync();

        await world.Items.EditAsync(item.Id, Plain("Different"));

        Assert.False(world.History.CanRedo);
        Assert.Equal("Edit 'Different'", world.History.UndoDescription);
    }

    [Fact]
    public async Task Trash_purge_is_not_recorded()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        var batchId = await world.Items.DeleteAsync(world.Project.Id, null, item.Id);
        var stepsBefore = world.Recorder.Descriptions.Count;

        await world.Trash.PurgeAsync(batchId);

        Assert.Equal(stepsBefore, world.Recorder.Descriptions.Count);
    }

    [Fact]
    public async Task Restoring_from_the_trash_is_recorded_and_undoable()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        var batchId = await world.Items.DeleteAsync(world.Project.Id, null, item.Id);
        var deleted = await world.SnapshotAsync();
        await world.Trash.RestoreAsync(batchId);

        await world.History.UndoAsync();

        Assert.Equal("Restore 'Task'", world.Recorder.Descriptions[^1]);
        Assert.Equal(deleted, await world.SnapshotAsync());
    }

    [Fact]
    public async Task An_edit_that_changes_nothing_records_no_step()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        var stepsBefore = world.Recorder.Descriptions.Count;

        await world.Items.EditAsync(item.Id, Plain("Task"));

        Assert.Equal(stepsBefore, world.Recorder.Descriptions.Count);
    }

    private static ItemEdit Plain(string title)
    {
        return new ItemEdit(title, null, null, null, null, null, null, null, null);
    }

    private static async Task RenameBehindTheHistoryAsync(UndoWorld world, Guid itemId, string title)
    {
        await using var database = world.OpenContext();
        var item = await database.TodoItems.SingleAsync(row => row.Id == itemId);
        item.Rename(title, TimeProvider.System);
        await database.SaveChangesAsync();
    }
}