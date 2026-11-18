#pragma warning disable xUnit1051
using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;

namespace TaskTracker.Infrastructure.Tests.Persistence;

/// <summary>Undo and redo of item operations, checked against rows read through a fresh context.</summary>
public sealed class ItemUndoTests
{
    [Fact]
    public async Task Creating_an_item_undoes_and_redoes_as_one_step()
    {
        await using var world = await UndoWorld.CreateAsync();
        var before = await world.SnapshotAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        var after = await world.SnapshotAsync();

        await world.History.UndoAsync();

        Assert.Equal(["Create 'Task'"], world.Recorder.Descriptions);
        Assert.Equal(before, await world.SnapshotAsync());
        Assert.False(await world.ItemExistsAsync(item.Id));

        await world.History.RedoAsync();

        Assert.Equal(after, await world.SnapshotAsync());
    }

    [Fact]
    public async Task Creating_a_sub_item_undoes_and_redoes()
    {
        await using var world = await UndoWorld.CreateAsync();
        var parent = await world.Items.CreateAsync(world.Project.Id, null, null, "Parent");
        var before = await world.SnapshotAsync();
        await world.Items.CreateAsync(world.Project.Id, null, parent.Id, "Child");
        var after = await world.SnapshotAsync();

        await world.History.UndoAsync();

        Assert.Equal(before, await world.SnapshotAsync());

        await world.History.RedoAsync();

        Assert.Equal(after, await world.SnapshotAsync());
    }

    [Fact]
    public async Task Saving_built_in_and_custom_fields_is_one_step()
    {
        await using var world = await UndoWorld.CreateAsync();
        var field = await world.Fields.CreateAsync("Notes", FieldDataType.Text, null);
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        var before = await world.SnapshotAsync();
        var edit = new ItemEdit("Renamed", "Details", null, null, null, null, null, null, null);
        await world.Items.EditAsync(item.Id, edit, [new FieldValueInput(field.Id, TextValue: "hello")]);
        var after = await world.SnapshotAsync();

        await world.History.UndoAsync();

        Assert.Equal(["Add field 'Notes'", "Create 'Task'", "Edit 'Renamed'"], world.Recorder.Descriptions);
        Assert.Equal(before, await world.SnapshotAsync());
        Assert.Empty(await world.ReadFieldValuesAsync(item.Id));

        await world.History.RedoAsync();

        Assert.Equal(after, await world.SnapshotAsync());
        Assert.Equal("hello", Assert.Single(await world.ReadFieldValuesAsync(item.Id)).TextValue);
    }

    [Fact]
    public async Task Changing_only_a_custom_value_undoes_to_the_old_value()
    {
        await using var world = await UndoWorld.CreateAsync();
        var field = await world.Fields.CreateAsync("Notes", FieldDataType.Text, null);
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        var plain = new ItemEdit("Task", null, null, null, null, null, null, null, null);
        await world.Items.EditAsync(item.Id, plain, [new FieldValueInput(field.Id, TextValue: "first")]);
        await world.Items.EditAsync(item.Id, plain, [new FieldValueInput(field.Id, TextValue: "second")]);

        await world.History.UndoAsync();

        Assert.Equal("first", Assert.Single(await world.ReadFieldValuesAsync(item.Id)).TextValue);

        await world.History.RedoAsync();

        Assert.Equal("second", Assert.Single(await world.ReadFieldValuesAsync(item.Id)).TextValue);
    }

    [Fact]
    public async Task Completing_the_last_child_undoes_and_redoes_the_whole_cascade()
    {
        await using var world = await UndoWorld.CreateAsync();
        var parent = await world.Items.CreateAsync(world.Project.Id, null, null, "Parent");
        var child = await world.Items.CreateAsync(world.Project.Id, null, parent.Id, "Child");
        var before = await world.SnapshotAsync();
        await world.Items.SetCompletedAsync(world.Project.Id, null, child.Id, true);
        var after = await world.SnapshotAsync();
        var stepsAfterCompleting = world.Recorder.Descriptions.Count;

        await world.History.UndoAsync();

        Assert.Equal(3, stepsAfterCompleting);
        Assert.Equal(before, await world.SnapshotAsync());
        Assert.Null((await world.ReadItemAsync(parent.Id)).CompletedAtUtc);
        Assert.Null((await world.ReadItemAsync(child.Id)).CompletedAtUtc);

        await world.History.RedoAsync();

        Assert.Equal(after, await world.SnapshotAsync());
        Assert.NotNull((await world.ReadItemAsync(parent.Id)).CompletedAtUtc);
    }

    [Fact]
    public async Task Reopening_a_cascade_completed_parent_undoes_to_completed()
    {
        await using var world = await UndoWorld.CreateAsync();
        var parent = await world.Items.CreateAsync(world.Project.Id, null, null, "Parent");
        var child = await world.Items.CreateAsync(world.Project.Id, null, parent.Id, "Child");
        await world.Items.SetCompletedAsync(world.Project.Id, null, child.Id, true);
        var completed = await world.SnapshotAsync();
        await world.Items.SetCompletedAsync(world.Project.Id, null, child.Id, false);

        await world.History.UndoAsync();

        Assert.Equal(completed, await world.SnapshotAsync());
        Assert.StartsWith("Reopen", world.Recorder.Descriptions[^1]);
    }

    [Fact]
    public async Task Deleting_an_item_restores_its_whole_branch_on_undo()
    {
        await using var world = await UndoWorld.CreateAsync();
        var parent = await world.Items.CreateAsync(world.Project.Id, null, null, "Parent");
        await world.Items.CreateAsync(world.Project.Id, null, parent.Id, "Child");
        var sibling = await world.Items.CreateAsync(world.Project.Id, null, null, "Sibling");
        var before = await world.SnapshotAsync();
        await world.Items.DeleteAsync(world.Project.Id, null, parent.Id);
        var after = await world.SnapshotAsync();

        await world.History.UndoAsync();

        Assert.Equal("Delete 'Parent'", world.Recorder.Descriptions[^1]);
        Assert.Equal(before, await world.SnapshotAsync());
        Assert.Equal(0, (await world.ReadItemAsync(parent.Id)).SortOrder);
        Assert.Equal(1, (await world.ReadItemAsync(sibling.Id)).SortOrder);

        await world.History.RedoAsync();

        Assert.Equal(after, await world.SnapshotAsync());
    }

    [Fact]
    public async Task Reordering_siblings_undoes_and_redoes()
    {
        await using var world = await UndoWorld.CreateAsync();
        var first = await world.Items.CreateAsync(world.Project.Id, null, null, "First");
        var second = await world.Items.CreateAsync(world.Project.Id, null, null, "Second");
        var before = await world.SnapshotAsync();
        await world.Items.ReorderAsync(world.Project.Id, null, null, [second.Id, first.Id]);
        var after = await world.SnapshotAsync();

        await world.History.UndoAsync();

        Assert.Equal(before, await world.SnapshotAsync());

        await world.History.RedoAsync();

        Assert.Equal(after, await world.SnapshotAsync());
        Assert.Equal(0, (await world.ReadItemAsync(second.Id)).SortOrder);
    }

    [Fact]
    public async Task Dragging_an_item_to_a_new_position_undoes_and_redoes()
    {
        await using var world = await UndoWorld.CreateAsync();
        var first = await world.Items.CreateAsync(world.Project.Id, null, null, "First");
        await world.Items.CreateAsync(world.Project.Id, null, null, "Second");
        var before = await world.SnapshotAsync();
        await world.Items.MoveAtAsync(world.Project.Id, null, first.Id, null, 1);
        var after = await world.SnapshotAsync();

        await world.History.UndoAsync();

        Assert.Equal(before, await world.SnapshotAsync());

        await world.History.RedoAsync();

        Assert.Equal(after, await world.SnapshotAsync());
    }

    [Fact]
    public async Task Indenting_and_outdenting_each_undo_as_one_step()
    {
        await using var world = await UndoWorld.CreateAsync();
        await world.Items.CreateAsync(world.Project.Id, null, null, "Parent");
        var child = await world.Items.CreateAsync(world.Project.Id, null, null, "Child");
        var flat = await world.SnapshotAsync();
        await world.Items.IndentAsync(world.Project.Id, null, child.Id);
        var indented = await world.SnapshotAsync();
        await world.Items.OutdentAsync(world.Project.Id, null, child.Id);

        await world.History.UndoAsync();

        Assert.Equal(indented, await world.SnapshotAsync());

        await world.History.UndoAsync();

        Assert.Equal(flat, await world.SnapshotAsync());

        await world.History.RedoAsync();

        Assert.Equal(indented, await world.SnapshotAsync());
    }

    [Fact]
    public async Task Re_parenting_an_item_undoes_and_redoes()
    {
        await using var world = await UndoWorld.CreateAsync();
        await world.Items.CreateAsync(world.Project.Id, null, null, "Parent");
        var other = await world.Items.CreateAsync(world.Project.Id, null, null, "Other");
        var child = await world.Items.CreateAsync(world.Project.Id, null, other.Id, "Child");
        var before = await world.SnapshotAsync();
        var parent = (await world.Items.LoadAreaAsync(world.Project.Id, null)).Items[0].Item;
        await world.Items.MoveAsync(world.Project.Id, null, child.Id, parent.Id);
        var after = await world.SnapshotAsync();

        await world.History.UndoAsync();

        Assert.Equal(before, await world.SnapshotAsync());

        await world.History.RedoAsync();

        Assert.Equal(after, await world.SnapshotAsync());
    }

    [Fact]
    public async Task Moving_an_item_to_a_folder_undoes_and_redoes()
    {
        await using var world = await UndoWorld.CreateAsync();
        var folder = await world.Folders.CreateAsync(world.Project.Id, null, "Folder");
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        var before = await world.SnapshotAsync();
        await world.Items.MoveToAreaAsync(world.Project.Id, null, folder.Id, item.Id);
        var after = await world.SnapshotAsync();

        await world.History.UndoAsync();

        Assert.Equal(before, await world.SnapshotAsync());
        Assert.Null((await world.ReadItemAsync(item.Id)).FolderId);

        await world.History.RedoAsync();

        Assert.Equal(after, await world.SnapshotAsync());
        Assert.Equal(folder.Id, (await world.ReadItemAsync(item.Id)).FolderId);
    }
}