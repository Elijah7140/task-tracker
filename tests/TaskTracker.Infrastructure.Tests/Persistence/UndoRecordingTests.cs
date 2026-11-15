#pragma warning disable xUnit1051
using Microsoft.EntityFrameworkCore;

using TaskTracker.Core;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Settings;
using TaskTracker.Core.Undo;

namespace TaskTracker.Infrastructure.Tests.Persistence;

/// <summary>What is recorded (only labelled saves), how steps are named, and what a step contains.</summary>
public sealed class UndoRecordingTests
{
    [Fact]
    public async Task Clearing_a_custom_field_is_recorded_and_undo_restores_the_value()
    {
        await using var world = await UndoWorld.CreateAsync();
        var field = await world.Fields.CreateAsync("Notes", FieldDataType.Text, null);
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        await world.Items.EditAsync(item.Id, Plain("Task"), [new FieldValueInput(field.Id, TextValue: "keep me")]);
        await world.Items.EditAsync(item.Id, Plain("Task"), [new FieldValueInput(field.Id)]);

        await world.History.UndoAsync();

        Assert.Equal("Edit 'Task'", world.Recorder.Descriptions[^1]);
        Assert.Equal("keep me", Assert.Single(await world.ReadFieldValuesAsync(item.Id)).TextValue);

        await world.History.RedoAsync();

        Assert.Empty(await world.ReadFieldValuesAsync(item.Id));
    }

    [Fact]
    public async Task Clearing_a_field_while_renaming_is_one_step()
    {
        await using var world = await UndoWorld.CreateAsync();
        var field = await world.Fields.CreateAsync("Notes", FieldDataType.Text, null);
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        await world.Items.EditAsync(item.Id, Plain("Task"), [new FieldValueInput(field.Id, TextValue: "value")]);
        var before = await world.SnapshotAsync();
        await world.Items.EditAsync(item.Id, Plain("Renamed"), [new FieldValueInput(field.Id)]);

        await world.History.UndoAsync();

        Assert.Equal(before, await world.SnapshotAsync());
        Assert.Single(await world.ReadFieldValuesAsync(item.Id));
    }

    [Fact]
    public async Task A_custom_field_only_edit_is_named_after_the_item()
    {
        await using var world = await UndoWorld.CreateAsync();
        var field = await world.Fields.CreateAsync("Notes", FieldDataType.Text, null);
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");

        await world.Items.EditAsync(item.Id, Plain("Task"), [new FieldValueInput(field.Id, TextValue: "value")]);

        Assert.Equal("Edit 'Task'", world.Recorder.Descriptions[^1]);
    }

    [Fact]
    public async Task Turning_on_auto_complete_records_nothing_even_though_it_completes_parents()
    {
        await using var world = await UndoWorld.CreateAsync();
        await world.Settings.SetGlobalAsync(SettingsCatalogue.AutoCompleteParents, false);
        var parent = await world.Items.CreateAsync(world.Project.Id, null, null, "Parent");
        var child = await world.Items.CreateAsync(world.Project.Id, null, parent.Id, "Child");
        await world.Items.SetCompletedAsync(world.Project.Id, null, child.Id, true);
        var stepsBefore = world.Recorder.Descriptions.Count;

        await world.Settings.SetGlobalAsync(SettingsCatalogue.AutoCompleteParents, true, confirmed: true);

        Assert.NotNull((await world.ReadItemAsync(parent.Id)).CompletedAtUtc);
        Assert.Equal(stepsBefore, world.Recorder.Descriptions.Count);
    }

    [Fact]
    public async Task Completing_a_child_that_completes_its_parent_is_named_after_the_child()
    {
        await using var world = await UndoWorld.CreateAsync();
        var parent = await world.Items.CreateAsync(world.Project.Id, null, null, "Parent");
        await world.Items.CreateAsync(world.Project.Id, null, parent.Id, "Sibling");
        var child = await world.Items.CreateAsync(world.Project.Id, null, parent.Id, "Child");
        await world.Items.SetCompletedAsync(world.Project.Id, null, (await FirstChildAsync(world, parent.Id)).Id, true);

        await world.Items.SetCompletedAsync(world.Project.Id, null, child.Id, true);

        Assert.Equal("Complete 'Child'", world.Recorder.Descriptions[^1]);
        Assert.NotNull((await world.ReadItemAsync(parent.Id)).CompletedAtUtc);
    }

    [Fact]
    public async Task Deleting_an_item_with_siblings_and_children_is_named_after_that_item()
    {
        await using var world = await UndoWorld.CreateAsync();
        await world.Items.CreateAsync(world.Project.Id, null, null, "Before");
        var target = await world.Items.CreateAsync(world.Project.Id, null, null, "Target");
        await world.Items.CreateAsync(world.Project.Id, null, target.Id, "Its child");
        await world.Items.CreateAsync(world.Project.Id, null, null, "After");

        await world.Items.DeleteAsync(world.Project.Id, null, target.Id);

        Assert.Equal("Delete 'Target'", world.Recorder.Descriptions[^1]);
    }

    [Fact]
    public async Task Indent_outdent_and_reorder_are_named_for_what_the_user_did()
    {
        await using var world = await UndoWorld.CreateAsync();
        var first = await world.Items.CreateAsync(world.Project.Id, null, null, "First");
        var second = await world.Items.CreateAsync(world.Project.Id, null, null, "Second");

        await world.Items.IndentAsync(world.Project.Id, null, second.Id);
        await world.Items.OutdentAsync(world.Project.Id, null, second.Id);
        await world.Items.ReorderAsync(world.Project.Id, null, null, [second.Id, first.Id]);

        Assert.Equal(["Indent 'Second'", "Outdent 'Second'", "Reorder items"],
            world.Recorder.Descriptions.Skip(2));
    }

    [Fact]
    public async Task Saving_without_a_label_records_nothing()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        var batchId = await world.Items.DeleteAsync(world.Project.Id, null, item.Id);
        var stepsBefore = world.Recorder.Descriptions.Count;

        await world.Items.RestoreAsync(world.Project.Id, null, batchId);
        await world.Fields.CreateAsync("Notes", FieldDataType.Text, null);

        Assert.Equal(stepsBefore, world.Recorder.Descriptions.Count);
    }

    [Fact]
    public async Task A_save_that_only_touches_update_stamps_records_no_step()
    {
        await using var world = await UndoWorld.CreateAsync();
        var first = await world.Items.CreateAsync(world.Project.Id, null, null, "First");
        var second = await world.Items.CreateAsync(world.Project.Id, null, null, "Second");
        world.Clock.Advance(TimeSpan.FromMinutes(5));
        var stepsBefore = world.Recorder.Descriptions.Count;

        await world.Items.ReorderAsync(world.Project.Id, null, null, [first.Id, second.Id]);

        Assert.Equal(stepsBefore, world.Recorder.Descriptions.Count);
    }

    [Fact]
    public async Task A_step_holds_only_changed_rows_so_unrelated_edits_do_not_block_it()
    {
        await using var world = await UndoWorld.CreateAsync();
        var first = await world.Items.CreateAsync(world.Project.Id, null, null, "First");
        var second = await world.Items.CreateAsync(world.Project.Id, null, null, "Second");
        var third = await world.Items.CreateAsync(world.Project.Id, null, null, "Third");
        await world.Items.ReorderAsync(world.Project.Id, null, null, [second.Id, first.Id, third.Id]);
        world.Clock.Advance(TimeSpan.FromMinutes(5));
        await world.Items.EditAsync(third.Id, Plain("Third renamed"));
        world.History.Clear();
        world.Clock.Advance(TimeSpan.FromMinutes(5));
        await world.Items.ReorderAsync(world.Project.Id, null, null, [first.Id, second.Id, third.Id]);
        world.Clock.Advance(TimeSpan.FromMinutes(5));
        await RenameBehindTheHistoryAsync(world, third.Id, "Third again");

        await world.History.UndoAsync();

        Assert.Equal(1, (await world.ReadItemAsync(first.Id)).SortOrder);
        Assert.Equal("Third again", (await world.ReadItemAsync(third.Id)).Title);
    }

    [Fact]
    public async Task History_keeps_fifty_steps_recorded_through_real_units_of_work()
    {
        await using var world = await UndoWorld.CreateAsync();

        for (var number = 1; number <= UndoHistory.Capacity + 1; number++)
        {
            await world.Items.CreateAsync(world.Project.Id, null, null, $"Item {number}");
        }

        var undone = 0;

        while (world.History.CanUndo)
        {
            await world.History.UndoAsync();
            undone++;
        }

        Assert.Equal(UndoHistory.Capacity, undone);
        Assert.Equal("Create 'Item 2'", world.History.RedoDescription);
        Assert.True(await ItemTitleExistsAsync(world, "Item 1"));
        Assert.False(await ItemTitleExistsAsync(world, "Item 2"));
    }

    [Fact]
    public async Task Undo_that_breaks_a_foreign_key_is_refused_with_a_clear_message_and_changes_nothing()
    {
        await using var world = await UndoWorld.CreateAsync();
        var field = await world.Fields.CreateAsync("Status", FieldDataType.Choice, null);
        var choice = await world.Fields.AddChoiceAsync(field.Id, "Ready");
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        await world.Items.EditAsync(item.Id, Plain("Task"), [new FieldValueInput(field.Id, ChoiceId: choice.Id)]);
        await world.Items.EditAsync(item.Id, Plain("Task"), [new FieldValueInput(field.Id)]);
        await RemoveChoiceBehindTheHistoryAsync(world, choice.Id);
        var before = await world.SnapshotAsync();

        var error = await Assert.ThrowsAsync<DomainRuleException>(() => world.History.UndoAsync());

        Assert.Equal("This change references something that was removed; can't undo.", error.Message);
        Assert.Equal(before, await world.SnapshotAsync());
        Assert.Empty(await world.ReadFieldValuesAsync(item.Id));
        Assert.True(world.History.CanUndo);
    }

    private static ItemEdit Plain(string title)
    {
        return new ItemEdit(title, null, null, null, null, null, null, null, null);
    }

    private static async Task<TodoItem> FirstChildAsync(UndoWorld world, Guid parentId)
    {
        var area = await world.Items.LoadAreaAsync(world.Project.Id, null);
        return area.Items.Single(node => node.Item.Id == parentId).Children[0].Item;
    }

    private static async Task<bool> ItemTitleExistsAsync(UndoWorld world, string title)
    {
        await using var database = world.OpenContext();
        return await database.TodoItems.AnyAsync(item => item.Title == title);
    }

    private static async Task RenameBehindTheHistoryAsync(UndoWorld world, Guid itemId, string title)
    {
        await using var database = world.OpenContext();
        var item = await database.TodoItems.SingleAsync(row => row.Id == itemId);
        item.Rename(title, world.Clock);
        await database.SaveChangesAsync();
    }

    private static async Task RemoveChoiceBehindTheHistoryAsync(UndoWorld world, Guid choiceId)
    {
        await using var database = world.OpenContext();
        var choice = await database.FieldChoices.SingleAsync(row => row.Id == choiceId);
        database.FieldChoices.Remove(choice);
        await database.SaveChangesAsync();
    }
}