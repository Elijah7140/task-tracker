#pragma warning disable xUnit1051
using Microsoft.EntityFrameworkCore;

using TaskTracker.Core;
using TaskTracker.Core.Calendar;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Search;
using TaskTracker.Core.Settings;
using TaskTracker.Core.Trash;
using TaskTracker.Infrastructure.Tests.Persistence;

namespace TaskTracker.Infrastructure.Tests.Trash;

public sealed class TrashServiceTests
{
    [Fact]
    public async Task Listing_is_empty_when_nothing_is_deleted()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");
        await world.Items.CreateAsync(project.Id, null, null, "Live");

        var batches = await world.Trash.ListAsync(TrashScope.AllProjects);

        Assert.Empty(batches);
    }

    [Fact]
    public async Task Listing_shows_one_row_per_batch_newest_first()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");
        var folder = await world.Folders.CreateAsync(project.Id, null, "Folder");
        var item = await world.Items.CreateAsync(project.Id, null, null, "Item");
        var other = await world.Projects.CreateAsync("Other");
        await world.Items.DeleteAsync(project.Id, null, item.Id);
        world.Tick();
        await world.Folders.DeleteAsync(project.Id, folder.Id);
        world.Tick();
        await world.Projects.DeleteAsync(other.Id);

        var batches = await world.Trash.ListAsync(TrashScope.AllProjects);

        Assert.Equal(["Other", "Folder", "Item"], batches.Select(batch => batch.Title));
        Assert.Equal([TrashNodeKind.Project, TrashNodeKind.Folder, TrashNodeKind.Item], batches.Select(batch => batch.Kind));
    }

    [Fact]
    public async Task Listing_counts_the_folders_and_items_of_each_batch()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");
        var parent = await world.Folders.CreateAsync(project.Id, null, "Parent");
        var child = await world.Folders.CreateAsync(project.Id, parent.Id, "Child");
        var top = await world.Items.CreateAsync(project.Id, child.Id, null, "Top");
        await world.Items.CreateAsync(project.Id, child.Id, top.Id, "Sub");
        await world.Items.CreateAsync(project.Id, parent.Id, null, "Beside");
        await world.Folders.DeleteAsync(project.Id, parent.Id);

        var batch = Assert.Single(await world.Trash.ListAsync(TrashScope.AllProjects));

        Assert.Equal(2, batch.FolderCount);
        Assert.Equal(3, batch.ItemCount);
        Assert.Equal(parent.Id, batch.TopNodeId);
    }

    [Fact]
    public async Task Listing_counts_a_single_deleted_item_as_one_item()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");
        var item = await world.Items.CreateAsync(project.Id, null, null, "Lonely");
        await world.Items.DeleteAsync(project.Id, null, item.Id);

        var batch = Assert.Single(await world.Trash.ListAsync(TrashScope.AllProjects));

        Assert.Equal(1, batch.ItemCount);
        Assert.Equal(0, batch.FolderCount);
    }

    [Fact]
    public async Task Listing_reports_the_deletion_time_of_the_top_node()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");
        var item = await world.Items.CreateAsync(project.Id, null, null, "Item");
        world.Tick();
        var expected = world.Store.Clock.GetUtcNow().UtcDateTime;
        await world.Items.DeleteAsync(project.Id, null, item.Id);

        var batch = Assert.Single(await world.Trash.ListAsync(TrashScope.AllProjects));

        Assert.Equal(expected, batch.DeletedAtUtc);
    }

    [Fact]
    public async Task Listing_path_uses_project_folder_and_parent_item_names_even_when_deleted()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Billing");
        var outer = await world.Folders.CreateAsync(project.Id, null, "dbo");
        var inner = await world.Folders.CreateAsync(project.Id, outer.Id, "Tables");
        var parent = await world.Items.CreateAsync(project.Id, inner.Id, null, "Parent");
        var sub = await world.Items.CreateAsync(project.Id, inner.Id, parent.Id, "Sub");
        await world.Items.DeleteAsync(project.Id, inner.Id, sub.Id);
        await world.Items.DeleteAsync(project.Id, inner.Id, parent.Id);
        await world.Folders.DeleteAsync(project.Id, outer.Id);

        var batches = await world.Trash.ListAsync(TrashScope.AllProjects);

        Assert.Equal(["Billing", "dbo", "Tables", "Parent"], batches.Single(batch => batch.Title == "Sub").Path);
        Assert.Equal(["Billing", "dbo", "Tables"], batches.Single(batch => batch.Title == "Parent").Path);
        Assert.Equal(["Billing"], batches.Single(batch => batch.Title == "dbo").Path);
    }

    [Fact]
    public async Task Listing_path_of_a_project_is_empty_and_of_a_root_item_is_the_project()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Kept");
        var gone = await world.Projects.CreateAsync("Gone");
        var item = await world.Items.CreateAsync(project.Id, null, null, "Root item");
        await world.Items.DeleteAsync(project.Id, null, item.Id);
        await world.Projects.DeleteAsync(gone.Id);

        var batches = await world.Trash.ListAsync(TrashScope.AllProjects);

        Assert.Empty(batches.Single(batch => batch.Title == "Gone").Path);
        Assert.Equal(["Kept"], batches.Single(batch => batch.Title == "Root item").Path);
    }

    [Fact]
    public async Task Listing_for_one_project_leaves_out_other_projects()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var first = await world.Projects.CreateAsync("First");
        var second = await world.Projects.CreateAsync("Second");
        var firstItem = await world.Items.CreateAsync(first.Id, null, null, "First item");
        var secondItem = await world.Items.CreateAsync(second.Id, null, null, "Second item");
        await world.Items.DeleteAsync(first.Id, null, firstItem.Id);
        await world.Items.DeleteAsync(second.Id, null, secondItem.Id);

        var batches = await world.Trash.ListAsync(TrashScope.ForProject(first.Id));

        Assert.Equal("First item", Assert.Single(batches).Title);
    }

    [Fact]
    public async Task Listing_blocks_a_folder_whose_parent_folder_is_deleted()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");
        var outer = await world.Folders.CreateAsync(project.Id, null, "Outer");
        var inner = await world.Folders.CreateAsync(project.Id, outer.Id, "Inner");
        await world.Folders.DeleteAsync(project.Id, inner.Id);
        await world.Folders.DeleteAsync(project.Id, outer.Id);

        var batches = await world.Trash.ListAsync(TrashScope.AllProjects);

        Assert.Equal("Restore the folder 'Outer' first", batches.Single(batch => batch.Title == "Inner").RestoreBlockedReason);
        Assert.True(batches.Single(batch => batch.Title == "Outer").CanRestore);
    }

    [Fact]
    public async Task Listing_blocks_an_item_whose_folder_or_parent_item_or_project_is_deleted()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Doomed");
        var folder = await world.Folders.CreateAsync(project.Id, null, "Folder");
        var inFolder = await world.Items.CreateAsync(project.Id, folder.Id, null, "In folder");
        var parent = await world.Items.CreateAsync(project.Id, null, null, "Parent");
        var sub = await world.Items.CreateAsync(project.Id, null, parent.Id, "Sub");
        await world.Items.DeleteAsync(project.Id, folder.Id, inFolder.Id);
        await world.Folders.DeleteAsync(project.Id, folder.Id);
        await world.Items.DeleteAsync(project.Id, null, sub.Id);
        await world.Items.DeleteAsync(project.Id, null, parent.Id);

        var batches = await world.Trash.ListAsync(TrashScope.AllProjects);

        Assert.Equal("Restore the folder 'Folder' first", batches.Single(batch => batch.Title == "In folder").RestoreBlockedReason);
        Assert.Equal("Restore the item 'Parent' first", batches.Single(batch => batch.Title == "Sub").RestoreBlockedReason);

        await world.Projects.DeleteAsync(project.Id);
        batches = await world.Trash.ListAsync(TrashScope.AllProjects);

        Assert.Equal("Restore the project first", batches.Single(batch => batch.Title == "Parent").RestoreBlockedReason);
        Assert.Equal("Restore the project first", batches.Single(batch => batch.Title == "Folder").RestoreBlockedReason);
    }

    [Fact]
    public async Task Restoring_an_item_restores_only_that_batch()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");
        var first = await world.Items.CreateAsync(project.Id, null, null, "First");
        var second = await world.Items.CreateAsync(project.Id, null, null, "Second");
        var firstBatch = await world.Items.DeleteAsync(project.Id, null, first.Id);
        await world.Items.DeleteAsync(project.Id, null, second.Id);

        await world.Trash.RestoreAsync(firstBatch);

        Assert.Null((await world.ReadItemAsync(first.Id)).DeletedAtUtc);
        Assert.NotNull((await world.ReadItemAsync(second.Id)).DeletedAtUtc);
    }

    [Fact]
    public async Task Restoring_a_folder_leaves_rows_deleted_earlier_in_another_batch_deleted()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");
        var folder = await world.Folders.CreateAsync(project.Id, null, "Folder");
        var early = await world.Items.CreateAsync(project.Id, folder.Id, null, "Early");
        var late = await world.Items.CreateAsync(project.Id, folder.Id, null, "Late");
        var earlyBatch = await world.Items.DeleteAsync(project.Id, folder.Id, early.Id);
        var folderBatch = await world.Folders.DeleteAsync(project.Id, folder.Id);

        await world.Trash.RestoreAsync(folderBatch);

        Assert.Null((await world.ReadFolderAsync(folder.Id)).DeletedAtUtc);
        Assert.Null((await world.ReadItemAsync(late.Id)).DeletedAtUtc);
        Assert.Equal(earlyBatch, (await world.ReadItemAsync(early.Id)).DeletionBatchId);
        var remaining = Assert.Single(await world.Trash.ListAsync(TrashScope.AllProjects));
        Assert.Equal("Early", remaining.Title);
        Assert.True(remaining.CanRestore);
    }

    [Fact]
    public async Task Restoring_a_project_restores_its_folders_and_items()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");
        var folder = await world.Folders.CreateAsync(project.Id, null, "Folder");
        var item = await world.Items.CreateAsync(project.Id, folder.Id, null, "Item");
        var batch = await world.Projects.DeleteAsync(project.Id);

        await world.Trash.RestoreAsync(batch);

        Assert.Null((await world.ReadProjectAsync(project.Id)).DeletedAtUtc);
        Assert.Null((await world.ReadFolderAsync(folder.Id)).DeletedAtUtc);
        Assert.Null((await world.ReadItemAsync(item.Id)).DeletedAtUtc);
        Assert.Empty(await world.Trash.ListAsync(TrashScope.AllProjects));
    }

    [Fact]
    public async Task Restored_top_node_goes_to_the_end_of_its_siblings()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");
        var first = await world.Items.CreateAsync(project.Id, null, null, "First");
        await world.Items.CreateAsync(project.Id, null, null, "Second");
        await world.Items.CreateAsync(project.Id, null, null, "Third");
        var batch = await world.Items.DeleteAsync(project.Id, null, first.Id);

        await world.Trash.RestoreAsync(batch);

        Assert.Equal(2, (await world.ReadItemAsync(first.Id)).SortOrder);
    }

    [Fact]
    public async Task Restored_top_node_goes_after_the_largest_sort_order_when_there_is_a_gap()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");
        var first = await world.Items.CreateAsync(project.Id, null, null, "First");
        var second = await world.Items.CreateAsync(project.Id, null, null, "Second");
        var third = await world.Items.CreateAsync(project.Id, null, null, "Third");
        await world.Items.ReorderAsync(project.Id, null, null, [first.Id, second.Id, third.Id]);
        var batch = await world.Items.DeleteAsync(project.Id, null, first.Id);
        await SetSortOrderAsync(world, third.Id, 7);

        await world.Trash.RestoreAsync(batch);

        Assert.Equal(8, (await world.ReadItemAsync(first.Id)).SortOrder);
    }

    [Fact]
    public async Task Restoring_a_batch_whose_parent_is_deleted_is_refused_and_changes_nothing()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");
        var outer = await world.Folders.CreateAsync(project.Id, null, "Outer");
        var inner = await world.Folders.CreateAsync(project.Id, outer.Id, "Inner");
        var innerBatch = await world.Folders.DeleteAsync(project.Id, inner.Id);
        var outerBatch = await world.Folders.DeleteAsync(project.Id, outer.Id);
        var before = await world.ReadFolderAsync(inner.Id);

        var error = await Assert.ThrowsAsync<DomainRuleException>(() => world.Trash.RestoreAsync(innerBatch));

        Assert.Equal("Restore the folder 'Outer' first", error.Message);
        var after = await world.ReadFolderAsync(inner.Id);
        Assert.NotNull(after.DeletedAtUtc);
        Assert.Equal(before.UpdatedAtUtc, after.UpdatedAtUtc);

        await world.Trash.RestoreAsync(outerBatch);
        await world.Trash.RestoreAsync(innerBatch);

        Assert.Null((await world.ReadFolderAsync(inner.Id)).DeletedAtUtc);
    }

    [Fact]
    public async Task Restoring_an_unknown_batch_is_a_rule_error()
    {
        await using var world = await TrashTestWorld.CreateAsync();

        await Assert.ThrowsAsync<DomainRuleException>(() => world.Trash.RestoreAsync(Guid.CreateVersion7()));
    }

    [Fact]
    public async Task Restoring_the_same_batch_twice_reports_that_it_is_gone()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");
        var item = await world.Items.CreateAsync(project.Id, null, null, "Item");
        var batch = await world.Items.DeleteAsync(project.Id, null, item.Id);
        await world.Trash.RestoreAsync(batch);

        await Assert.ThrowsAsync<DomainRuleException>(() => world.Trash.RestoreAsync(batch));
    }

    [Fact]
    public async Task Restoring_an_open_sub_item_reopens_a_completed_parent()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");
        var parent = await world.Items.CreateAsync(project.Id, null, null, "Parent");
        var open = await world.Items.CreateAsync(project.Id, null, parent.Id, "Open child");
        var done = await world.Items.CreateAsync(project.Id, null, parent.Id, "Done child");
        var batch = await world.Items.DeleteAsync(project.Id, null, open.Id);
        await world.Items.SetCompletedAsync(project.Id, null, done.Id, true);
        Assert.NotNull((await world.ReadItemAsync(parent.Id)).CompletedAtUtc);

        await world.Trash.RestoreAsync(batch);

        Assert.Null((await world.ReadItemAsync(parent.Id)).CompletedAtUtc);
    }

    [Fact]
    public async Task Restoring_a_completed_sub_item_keeps_a_completed_parent_completed()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");
        var parent = await world.Items.CreateAsync(project.Id, null, null, "Parent");
        var first = await world.Items.CreateAsync(project.Id, null, parent.Id, "First");
        var second = await world.Items.CreateAsync(project.Id, null, parent.Id, "Second");
        await world.Items.SetCompletedAsync(project.Id, null, first.Id, true);
        await world.Items.SetCompletedAsync(project.Id, null, second.Id, true);
        var batch = await world.Items.DeleteAsync(project.Id, null, second.Id);

        await world.Trash.RestoreAsync(batch);

        Assert.NotNull((await world.ReadItemAsync(parent.Id)).CompletedAtUtc);
    }

    [Fact]
    public async Task Restoring_an_open_sub_item_leaves_a_completed_parent_alone_when_auto_complete_is_off()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var settings = world.Store.Settings(world.Context);
        await settings.SetGlobalAsync(SettingsCatalogue.AutoCompleteParents, false);
        var project = await world.Projects.CreateAsync("Project");
        var parent = await world.Items.CreateAsync(project.Id, null, null, "Parent");
        var child = await world.Items.CreateAsync(project.Id, null, parent.Id, "Child");
        var batch = await world.Items.DeleteAsync(project.Id, null, child.Id);
        await world.Items.SetCompletedAsync(project.Id, null, parent.Id, true);

        await world.Trash.RestoreAsync(batch);

        Assert.NotNull((await world.ReadItemAsync(parent.Id)).CompletedAtUtc);
    }

    [Fact]
    public async Task Restored_items_are_searchable_again_and_leave_the_search_when_deleted()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");
        var item = await world.Items.CreateAsync(project.Id, null, null, "Zebra crossing");
        var batch = await world.Items.DeleteAsync(project.Id, null, item.Id);
        var whileDeleted = await SearchTitlesAsync(world, "zebra");

        await world.Trash.RestoreAsync(batch);
        var afterRestore = await SearchTitlesAsync(world, "zebra");

        Assert.Empty(whileDeleted);
        Assert.Equal(["Zebra crossing"], afterRestore);
        Assert.Equal(1, await world.CountRowsAsync("TodoItemSearch"));
    }

    [Fact]
    public async Task Restored_items_appear_in_the_calendar_again()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");
        var item = await world.Items.CreateAsync(project.Id, null, null, "Due soon");
        var due = new DateOnly(2026, 11, 16);
        await world.Items.EditAsync(item.Id, new ItemEdit("Due soon", null, null, null, null, due, null, null, null));
        var batch = await world.Items.DeleteAsync(project.Id, null, item.Id);
        var calendar = new CalendarService(new TestUnitOfWorkFactory(world.Context));
        var query = new CalendarQuery(null, due, due.AddDays(1), false);
        var whileDeleted = await calendar.LoadAsync(query);

        await world.Trash.RestoreAsync(batch);
        var afterRestore = await calendar.LoadAsync(query);

        Assert.Empty(whileDeleted);
        Assert.Equal(item.Id, Assert.Single(afterRestore).ItemId);
    }

    [Fact]
    public async Task Purging_an_item_removes_its_rows_values_and_search_entries_only()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");
        var note = await world.Store.Fields(world.Context).CreateAsync("Note", FieldDataType.Text, null);
        var doomed = await world.Items.CreateAsync(project.Id, null, null, "Doomed");
        var kept = await world.Items.CreateAsync(project.Id, null, null, "Kept");
        await SetNoteAsync(world, doomed, note, "gone");
        await SetNoteAsync(world, kept, note, "stays");
        var batch = await world.Items.DeleteAsync(project.Id, null, doomed.Id);
        var keptBatch = await world.Items.DeleteAsync(project.Id, null, kept.Id);

        await world.Trash.PurgeAsync(batch);

        Assert.False(await world.ItemExistsAsync(doomed.Id));
        Assert.True(await world.ItemExistsAsync(kept.Id));
        Assert.Equal(1, await world.CountRowsAsync("ItemFieldValue"));
        Assert.Equal(1, await world.CountRowsAsync("TodoItemSearchRow"));
        Assert.Equal(1, await world.CountRowsAsync("TodoItemSearch"));
        Assert.Equal(keptBatch, Assert.Single(await world.Trash.ListAsync(TrashScope.AllProjects)).BatchId);
    }

    [Fact]
    public async Task Purging_a_folder_removes_its_folders_items_and_sub_items()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");
        var outer = await world.Folders.CreateAsync(project.Id, null, "Outer");
        var inner = await world.Folders.CreateAsync(project.Id, outer.Id, "Inner");
        var item = await world.Items.CreateAsync(project.Id, inner.Id, null, "Item");
        var sub = await world.Items.CreateAsync(project.Id, inner.Id, item.Id, "Sub");
        var survivor = await world.Items.CreateAsync(project.Id, null, null, "Survivor");
        var batch = await world.Folders.DeleteAsync(project.Id, outer.Id);

        await world.Trash.PurgeAsync(batch);

        Assert.False(await world.FolderExistsAsync(outer.Id));
        Assert.False(await world.FolderExistsAsync(inner.Id));
        Assert.False(await world.ItemExistsAsync(item.Id));
        Assert.False(await world.ItemExistsAsync(sub.Id));
        Assert.True(await world.ItemExistsAsync(survivor.Id));
        Assert.Equal(1, await world.CountRowsAsync("TodoItemSearch"));
    }

    [Fact]
    public async Task Purging_an_item_with_deleted_sub_items_in_the_same_batch_removes_them_all()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");
        var parent = await world.Items.CreateAsync(project.Id, null, null, "Parent");
        var child = await world.Items.CreateAsync(project.Id, null, parent.Id, "Child");
        var batch = await world.Items.DeleteAsync(project.Id, null, parent.Id);

        await world.Trash.PurgeAsync(batch);

        Assert.False(await world.ItemExistsAsync(parent.Id));
        Assert.False(await world.ItemExistsAsync(child.Id));
    }

    [Fact]
    public async Task Purging_a_project_removes_everything_it_owns_and_nothing_else()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var fields = world.Store.Fields(world.Context);
        var doomed = await world.Projects.CreateAsync("Doomed");
        var kept = await world.Projects.CreateAsync("Kept");
        var global = await fields.CreateAsync("Global note", FieldDataType.Text, null);
        var own = await fields.CreateAsync("Own choice", FieldDataType.Choice, doomed.Id);
        var choice = await fields.AddChoiceAsync(own.Id, "Pick me");
        var folder = await world.Folders.CreateAsync(doomed.Id, null, "Folder");
        var earlier = await world.Items.CreateAsync(doomed.Id, folder.Id, null, "Earlier");
        var inside = await world.Items.CreateAsync(doomed.Id, null, null, "Inside");
        var survivor = await world.Items.CreateAsync(kept.Id, null, null, "Survivor");
        await SetNoteAsync(world, inside, global, "x");
        await world.Items.EditAsync(earlier.Id, new ItemEdit("Earlier", null, null, null, null, null, null, null, null),
            [new FieldValueInput(own.Id, ChoiceId: choice.Id)]);
        await world.Store.Settings(world.Context).SetProjectOverrideAsync(doomed.Id, SettingsCatalogue.AutoCompleteParents, false);
        await world.Items.DeleteAsync(doomed.Id, folder.Id, earlier.Id);
        var batch = await world.Projects.DeleteAsync(doomed.Id);

        await world.Trash.PurgeAsync(batch);

        Assert.False(await world.ProjectExistsAsync(doomed.Id));
        Assert.False(await world.FolderExistsAsync(folder.Id));
        Assert.False(await world.ItemExistsAsync(earlier.Id));
        Assert.False(await world.ItemExistsAsync(inside.Id));
        Assert.True(await world.ItemExistsAsync(survivor.Id));
        Assert.Equal(0, await world.CountRowsAsync("ItemFieldValue"));
        Assert.Equal(0, await world.CountRowsAsync("FieldChoice"));
        Assert.Equal(1, await world.CountRowsAsync("FieldDefinition"));
        Assert.Equal(0, await world.CountRowsAsync("ProjectSetting"));
        Assert.Equal(1, await world.CountRowsAsync("TodoItemSearch"));
    }

    [Fact]
    public async Task Purging_a_sub_item_batch_after_its_parent_was_deleted_is_allowed_but_the_reverse_is_refused()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");
        var parent = await world.Items.CreateAsync(project.Id, null, null, "Parent");
        var child = await world.Items.CreateAsync(project.Id, null, parent.Id, "Child");
        var childBatch = await world.Items.DeleteAsync(project.Id, null, child.Id);
        var parentBatch = await world.Items.DeleteAsync(project.Id, null, parent.Id);

        var error = await Assert.ThrowsAsync<DomainRuleException>(() => world.Trash.PurgeAsync(parentBatch));

        Assert.Contains("'Child'", error.Message);
        Assert.Contains("'Parent'", error.Message);
        Assert.True(await world.ItemExistsAsync(parent.Id));
        Assert.True(await world.ItemExistsAsync(child.Id));

        await world.Trash.PurgeAsync(childBatch);
        await world.Trash.PurgeAsync(parentBatch);

        Assert.False(await world.ItemExistsAsync(child.Id));
        Assert.False(await world.ItemExistsAsync(parent.Id));
    }

    [Fact]
    public async Task Purging_a_folder_is_refused_while_an_earlier_deleted_item_still_sits_in_it()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");
        var folder = await world.Folders.CreateAsync(project.Id, null, "Folder");
        var item = await world.Items.CreateAsync(project.Id, folder.Id, null, "Earlier");
        await world.Items.DeleteAsync(project.Id, folder.Id, item.Id);
        var folderBatch = await world.Folders.DeleteAsync(project.Id, folder.Id);

        var error = await Assert.ThrowsAsync<DomainRuleException>(() => world.Trash.PurgeAsync(folderBatch));

        Assert.Contains("'Earlier'", error.Message);
        Assert.True(await world.FolderExistsAsync(folder.Id));
        Assert.True(await world.ItemExistsAsync(item.Id));
    }

    [Fact]
    public async Task Purging_is_refused_when_a_live_row_still_points_at_a_deleted_one()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");
        var folder = await world.Folders.CreateAsync(project.Id, null, "Folder");
        var live = await world.Items.CreateAsync(project.Id, folder.Id, null, "Live");
        var batch = await DeleteFolderRowOnlyAsync(world, folder.Id);

        var purge = await Assert.ThrowsAsync<DomainRuleException>(() => world.Trash.PurgeAsync(batch));
        var empty = await Assert.ThrowsAsync<DomainRuleException>(() => world.Trash.EmptyAsync(TrashScope.AllProjects));

        Assert.Contains("'Live'", purge.Message);
        Assert.Contains("'Live'", empty.Message);
        Assert.True(await world.FolderExistsAsync(folder.Id));
        Assert.True(await world.ItemExistsAsync(live.Id));
    }

    [Fact]
    public async Task Purging_an_unknown_batch_is_a_rule_error()
    {
        await using var world = await TrashTestWorld.CreateAsync();

        await Assert.ThrowsAsync<DomainRuleException>(() => world.Trash.PurgeAsync(Guid.CreateVersion7()));
    }

    [Fact]
    public async Task A_failed_purge_leaves_nothing_for_the_next_operation_to_save()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");
        var parent = await world.Items.CreateAsync(project.Id, null, null, "Parent");
        var child = await world.Items.CreateAsync(project.Id, null, parent.Id, "Child");
        await world.Items.DeleteAsync(project.Id, null, child.Id);
        var parentBatch = await world.Items.DeleteAsync(project.Id, null, parent.Id);
        await Assert.ThrowsAsync<DomainRuleException>(() => world.Trash.PurgeAsync(parentBatch));

        var other = await world.Items.CreateAsync(project.Id, null, null, "Unrelated");
        var otherBatch = await world.Items.DeleteAsync(project.Id, null, other.Id);

        await world.Trash.RestoreAsync(otherBatch);

        Assert.True(await world.ItemExistsAsync(parent.Id));
        Assert.True(await world.ItemExistsAsync(child.Id));
        Assert.NotNull((await world.ReadItemAsync(parent.Id)).DeletedAtUtc);
        Assert.NotNull((await world.ReadItemAsync(child.Id)).DeletedAtUtc);
        Assert.Null((await world.ReadItemAsync(other.Id)).DeletedAtUtc);
        Assert.Equal(2, (await world.Trash.ListAsync(TrashScope.AllProjects)).Count);
    }

    [Fact]
    public async Task Emptying_one_project_removes_only_its_deleted_rows()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var first = await world.Projects.CreateAsync("First");
        var second = await world.Projects.CreateAsync("Second");
        var liveFirst = await world.Items.CreateAsync(first.Id, null, null, "Live first");
        var goneFirst = await world.Items.CreateAsync(first.Id, null, null, "Gone first");
        var goneSecond = await world.Items.CreateAsync(second.Id, null, null, "Gone second");
        await world.Items.DeleteAsync(first.Id, null, goneFirst.Id);
        await world.Items.DeleteAsync(second.Id, null, goneSecond.Id);

        await world.Trash.EmptyAsync(TrashScope.ForProject(first.Id));

        Assert.True(await world.ItemExistsAsync(liveFirst.Id));
        Assert.False(await world.ItemExistsAsync(goneFirst.Id));
        Assert.True(await world.ItemExistsAsync(goneSecond.Id));
    }

    [Fact]
    public async Task Emptying_all_projects_removes_deleted_projects_folders_and_items_but_keeps_live_rows()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var kept = await world.Projects.CreateAsync("Kept");
        var gone = await world.Projects.CreateAsync("Gone");
        var folder = await world.Folders.CreateAsync(kept.Id, null, "Folder");
        var liveItem = await world.Items.CreateAsync(kept.Id, null, null, "Live");
        var goneItem = await world.Items.CreateAsync(kept.Id, folder.Id, null, "Gone item");
        await world.Items.CreateAsync(gone.Id, null, null, "In gone project");
        await world.Folders.DeleteAsync(kept.Id, folder.Id);
        await world.Projects.DeleteAsync(gone.Id);

        await world.Trash.EmptyAsync(TrashScope.AllProjects);

        Assert.Empty(await world.Trash.ListAsync(TrashScope.AllProjects));
        Assert.True(await world.ProjectExistsAsync(kept.Id));
        Assert.False(await world.ProjectExistsAsync(gone.Id));
        Assert.False(await world.FolderExistsAsync(folder.Id));
        Assert.False(await world.ItemExistsAsync(goneItem.Id));
        Assert.True(await world.ItemExistsAsync(liveItem.Id));
        Assert.Equal(1, await world.CountRowsAsync("TodoItemSearch"));
    }

    [Fact]
    public async Task Emptying_an_empty_trash_does_nothing()
    {
        await using var world = await TrashTestWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Project");

        await world.Trash.EmptyAsync(TrashScope.AllProjects);

        Assert.True(await world.ProjectExistsAsync(project.Id));
    }

    /// <summary>Writes a sort order straight to the row, leaving a gap the services would never create.</summary>
    private static async Task SetSortOrderAsync(TrashTestWorld world, Guid itemId, int sortOrder)
    {
        await using var writer = world.Store.Open();
        var item = await writer.TodoItems.SingleAsync(row => row.Id == itemId);
        item.SetSortOrder(sortOrder, world.Store.Clock);
        await writer.SaveChangesAsync();
    }

    private static async Task<IReadOnlyList<string>> SearchTitlesAsync(TrashTestWorld world, string text)
    {
        var factory = new TestUnitOfWorkFactory(world.Context);
        var search = new ItemSearchService(factory, new ItemQueryValidator(factory));
        var results = await search.SearchAsync(new ItemQuery(new SearchScope.AllProjects(), text, [], true));
        return results.Items.Select(result => result.Title).ToArray();
    }

    private static async Task SetNoteAsync(TrashTestWorld world, TodoItem item, FieldDefinition field, string text)
    {
        var edit = new ItemEdit(item.Title, null, null, null, null, null, null, null, null);
        await world.Items.EditAsync(item.Id, edit, [new FieldValueInput(field.Id, TextValue: text)]);
    }

    /// <summary>Deletes only the folder row, leaving a live item that points at it; the services never allow this.</summary>
    private static async Task<Guid> DeleteFolderRowOnlyAsync(TrashTestWorld world, Guid folderId)
    {
        var batchId = Guid.CreateVersion7();
        await using var writer = world.Store.Open();
        var folder = await writer.Folders.SingleAsync(row => row.Id == folderId);
        folder.Delete(batchId, world.Store.Clock);
        await writer.SaveChangesAsync();
        return batchId;
    }
}