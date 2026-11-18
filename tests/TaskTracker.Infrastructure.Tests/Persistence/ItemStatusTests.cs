#pragma warning disable xUnit1051
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

using TaskTracker.Core;
using TaskTracker.Core.Completion;
using TaskTracker.Core.Items;
using TaskTracker.Core.Items.Recurrence;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Search;
using TaskTracker.Core.Search.Syntax;
using TaskTracker.Core.Settings;

namespace TaskTracker.Infrastructure.Tests.Persistence;

public sealed class ItemStatusTests
{
    [Fact]
    public async Task Setting_done_confirms_the_subtree_and_reopens_ancestors_with_their_previous_status()
    {
        await using var world = await UndoWorld.CreateAsync();
        var root = await world.Items.CreateAsync(world.Project.Id, null, null, "Root");
        var parent = await world.Items.CreateAsync(world.Project.Id, null, root.Id, "Parent");
        var leaf = await world.Items.CreateAsync(world.Project.Id, null, parent.Id, "Leaf");
        var open = (await world.Lookups.StatusesAsync()).First(status => status.Kind == StatusKind.Open);
        await world.Lookups.AddStatusAsync("Released", StatusKind.Done);
        var released = (await world.Lookups.StatusesAsync()).Single(status => status.Name == "Released");
        await world.Items.SetStatusAsync(root.Id, open.Id);
        await world.Items.SetStatusAsync(parent.Id, open.Id);

        var prompt = await world.Items.SetStatusAsync(parent.Id, released.Id);
        Assert.Equal(1, Assert.IsType<CompletionResult.NeedsConfirmation>(prompt).OpenSubItemCount);
        Assert.Equal(open.Id, (await world.ReadItemAsync(parent.Id)).StatusId);

        await world.Items.SetStatusAsync(parent.Id, released.Id, confirmed: true);

        Assert.Equal(released.Id, (await world.ReadItemAsync(parent.Id)).StatusId);
        Assert.Equal(BuiltInLookups.CompletedId, (await world.ReadItemAsync(leaf.Id)).StatusId);
        Assert.Equal(BuiltInLookups.CompletedId, (await world.ReadItemAsync(root.Id)).StatusId);
        Assert.Equal(open.Id, (await world.ReadItemAsync(root.Id)).ReopenStatusId);
        Assert.Equal("Set status of 'Parent'", world.History.UndoDescription);
        Assert.IsType<CompletionResult.Blocked>(await world.Items.SetStatusAsync(parent.Id, null));

        await world.Items.SetStatusAsync(leaf.Id, open.Id);

        var reopened = await world.ReadItemAsync(root.Id);
        Assert.Equal(open.Id, reopened.StatusId);
        Assert.Null(reopened.ReopenStatusId);
        Assert.Null(reopened.CompletedAtUtc);
        Assert.Equal(open.Id, (await world.ReadItemAsync(parent.Id)).StatusId);
    }

    [Fact]
    public async Task Structure_changes_complete_parents_with_the_first_Done_status_and_restore_their_open_status()
    {
        await using var world = await UndoWorld.CreateAsync();
        var released = await AddDoneStatusFirstAsync(world, "Released");
        var inProgress = await FindStatusAsync(world, "In progress");
        var parent = await world.Items.CreateAsync(world.Project.Id, null, null, "Parent");
        var open = await world.Items.CreateAsync(world.Project.Id, null, parent.Id, "Open child");
        var done = await world.Items.CreateAsync(world.Project.Id, null, parent.Id, "Done child");
        await world.Items.SetStatusAsync(parent.Id, inProgress.Id);
        await world.Items.SetCompletedAsync(world.Project.Id, null, done.Id, true);

        var batchId = await world.Items.DeleteAsync(world.Project.Id, null, open.Id);
        var completed = await world.ReadItemAsync(parent.Id);
        await world.Items.RestoreAsync(world.Project.Id, null, batchId);
        var restored = await world.ReadItemAsync(parent.Id);
        await world.Items.MoveAsync(world.Project.Id, null, open.Id, null);
        var movedAway = await world.ReadItemAsync(parent.Id);
        await world.Items.CreateAsync(world.Project.Id, null, parent.Id, "New child");
        var added = await world.ReadItemAsync(parent.Id);

        Assert.Equal((released.Id, inProgress.Id), (completed.StatusId, completed.ReopenStatusId));
        Assert.Equal((inProgress.Id, (Guid?)null), (restored.StatusId, restored.ReopenStatusId));
        Assert.Equal((released.Id, inProgress.Id), (movedAway.StatusId, movedAway.ReopenStatusId));
        Assert.Equal((inProgress.Id, (Guid?)null), (added.StatusId, added.ReopenStatusId));
        Assert.Equal(released.Id, (await world.ReadItemAsync(done.Id)).StatusId);
    }

    [Fact]
    public async Task Turning_auto_complete_on_completes_parents_with_the_first_Done_status()
    {
        await using var world = await UndoWorld.CreateAsync();
        await world.Settings.SetGlobalAsync(SettingsCatalogue.AutoCompleteParents, false);
        var testing = await FindStatusAsync(world, "Testing");
        var parent = await world.Items.CreateAsync(world.Project.Id, null, null, "Parent");
        var child = await world.Items.CreateAsync(world.Project.Id, null, parent.Id, "Child");
        await world.Items.SetStatusAsync(parent.Id, testing.Id);
        await world.Items.SetCompletedAsync(world.Project.Id, null, child.Id, true);
        var released = await AddDoneStatusFirstAsync(world, "Released");

        await world.Settings.SetGlobalAsync(SettingsCatalogue.AutoCompleteParents, true, confirmed: true);

        var reconciled = await world.ReadItemAsync(parent.Id);
        Assert.NotNull(reconciled.CompletedAtUtc);
        Assert.Equal((released.Id, testing.Id), (reconciled.StatusId, reconciled.ReopenStatusId));
    }

    [Fact]
    public async Task An_Open_status_or_none_reopens_a_completed_item_and_another_Done_status_keeps_it_completed()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Leaf");
        var queued = await FindStatusAsync(world, "Queued");
        var testing = await FindStatusAsync(world, "Testing");
        await world.Lookups.AddStatusAsync("Released", StatusKind.Done);
        var released = await FindStatusAsync(world, "Released");
        await world.Items.SetStatusAsync(item.Id, queued.Id);
        await world.Items.SetCompletedAsync(world.Project.Id, null, item.Id, true);

        await world.Items.SetStatusAsync(item.Id, released.Id);
        var switched = await world.ReadItemAsync(item.Id);
        await world.Items.SetStatusAsync(item.Id, testing.Id);
        var reopened = await world.ReadItemAsync(item.Id);
        await world.Items.SetCompletedAsync(world.Project.Id, null, item.Id, true);
        await world.Items.SetStatusAsync(item.Id, null);
        var cleared = await world.ReadItemAsync(item.Id);

        Assert.NotNull(switched.CompletedAtUtc);
        Assert.Equal((released.Id, queued.Id), (switched.StatusId, switched.ReopenStatusId));
        Assert.Null(reopened.CompletedAtUtc);
        Assert.Equal((testing.Id, (Guid?)null), (reopened.StatusId, reopened.ReopenStatusId));
        Assert.Null(cleared.CompletedAtUtc);
        Assert.Equal(((Guid?)null, (Guid?)null), (cleared.StatusId, cleared.ReopenStatusId));
    }

    [Fact]
    public async Task Archived_statuses_cannot_be_assigned()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Leaf");
        var queued = await FindStatusAsync(world, "Queued");
        await world.Lookups.SetStatusArchivedAsync(queued.Id, true);

        var error = await Assert.ThrowsAsync<DomainRuleException>(() => world.Items.SetStatusAsync(item.Id, queued.Id));

        Assert.Equal("Status is missing or archived.", error.Message);
        Assert.Null((await world.ReadItemAsync(item.Id)).StatusId);
    }

    [Fact]
    public async Task Priority_numbers_and_new_levels_can_be_undone()
    {
        await using var world = await UndoWorld.CreateAsync();
        await world.Lookups.SetPriorityNumberAsync(BuiltInLookups.HighId, 7);
        await world.Lookups.AddPriorityLevelAsync(string.Empty, 9);

        Assert.Equal("Add priority '9'", world.History.UndoDescription);
        await world.History.UndoAsync();
        Assert.Equal("Edit priority '7 · High'", world.History.UndoDescription);
        await world.History.UndoAsync();

        var levels = await world.Lookups.PriorityLevelsAsync();
        Assert.DoesNotContain(levels, level => level.Number == 9);
        Assert.Null(levels.Single(level => level.Id == BuiltInLookups.HighId).Number);
    }

    [Fact]
    public async Task Database_rejects_an_open_item_with_a_Done_status()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Open");
        await using var database = world.OpenContext();

        var error = await Assert.ThrowsAsync<SqliteException>(() => database.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE TodoItem SET StatusId = {BuiltInLookups.CompletedId} WHERE Id = {item.Id}"));

        Assert.Contains("Item status must agree with completion", error.Message);
    }

    [Fact]
    public async Task Status_lookups_and_assignments_can_be_undone_and_redone()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Report");
        await world.Lookups.AddStatusAsync("Reviewed", StatusKind.Done);
        var reviewed = (await world.Lookups.StatusesAsync()).Single(status => status.Name == "Reviewed");
        await world.Items.SetStatusAsync(item.Id, reviewed.Id);
        await world.Lookups.SetStatusArchivedAsync(BuiltInLookups.CompletedId, true);

        await Assert.ThrowsAsync<DomainRuleException>(() => world.Lookups.SetStatusArchivedAsync(reviewed.Id, true));
        await world.History.UndoAsync();
        await world.History.UndoAsync();
        Assert.Null((await world.ReadItemAsync(item.Id)).StatusId);
        await world.History.UndoAsync();
        Assert.DoesNotContain(await world.Lookups.StatusesAsync(), status => status.Id == reviewed.Id);

        await world.History.RedoAsync();
        await world.History.RedoAsync();

        Assert.Equal(reviewed.Id, (await world.ReadItemAsync(item.Id)).StatusId);
    }

    [Fact]
    public async Task Priority_numbers_bind_before_names_and_comparisons_follow_list_order()
    {
        await using var world = await UndoWorld.CreateAsync();
        await world.Lookups.SetPriorityNumberAsync(BuiltInLookups.CriticalId, 1);
        await world.Lookups.SetPriorityNumberAsync(BuiltInLookups.HighId, 7);
        await world.Lookups.SetPriorityNumberAsync(BuiltInLookups.MediumId, 2);
        var priorityNamedSeven = await world.Lookups.AddPriorityLevelAsync("7");
        await AddAtPriorityAsync(world, "Critical", BuiltInLookups.CriticalId);
        await AddAtPriorityAsync(world, "High", BuiltInLookups.HighId);
        await AddAtPriorityAsync(world, "Medium", BuiltInLookups.MediumId);
        await AddAtPriorityAsync(world, "Literal seven", priorityNamedSeven.Id);

        Assert.Equal("High", Assert.Single(await SearchAsync(world, "priority:7")).Title);
        Assert.Equal("Literal seven", Assert.Single(await SearchAsync(world, "priority:\"7\"")).Title);
        Assert.Equal("Critical", Assert.Single(await SearchAsync(world, "priority>7")).Title);
        Assert.Equal(["Literal seven", "Medium"], (await SearchAsync(world, "priority<7")).Select(row => row.Title));
    }

    [Fact]
    public async Task Status_matches_names_and_presence_independently_of_completion()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Release");
        await world.Items.CreateAsync(world.Project.Id, null, null, "Unscheduled");
        var testing = (await world.Lookups.StatusesAsync()).Single(status => status.Name == "Testing");
        await world.Items.SetStatusAsync(item.Id, testing.Id);

        Assert.Equal(item.Id, Assert.Single(await SearchAsync(world, "status:testing")).ItemId);
        Assert.Equal(item.Id, Assert.Single(await SearchAsync(world, "status~est")).ItemId);
        Assert.Equal("Unscheduled", Assert.Single(await SearchAsync(world, "no:status")).Title);
        Assert.Empty(await SearchAsync(world, "completed:true"));
    }

    [Fact]
    public async Task Done_status_keeps_an_open_parent_when_its_repeating_child_completes()
    {
        await using var world = await UndoWorld.CreateAsync();
        var parent = await world.Items.CreateAsync(world.Project.Id, null, null, "Parent");
        var child = await world.Items.CreateAsync(world.Project.Id, null, parent.Id, "Daily check");
        var testing = await FindStatusAsync(world, "Testing");
        await world.Items.SetStatusAsync(parent.Id, testing.Id);
        await world.Items.EditAsync(child.Id, new ItemEdit(child.Title, null, null, null, null,
            new DateOnly(2026, 11, 13), null, null, null)
        {
            UpdateRecurrence = true,
            Recurrence = new RecurrenceRule(RecurrenceFrequency.Daily)
        });

        var result = await world.Items.SetStatusAsync(parent.Id, BuiltInLookups.CompletedId, confirmed: true);

        var applied = Assert.IsType<CompletionResult.Applied>(result);
        Assert.Equal("A new occurrence of a sub-item keeps 'Parent' open.", applied.ParentKeptOpenMessage);
        var storedParent = await world.ReadItemAsync(parent.Id);
        Assert.Null(storedParent.CompletedAtUtc);
        Assert.Equal(testing.Id, storedParent.StatusId);
        Assert.NotNull((await world.ReadItemAsync(child.Id)).CompletedAtUtc);
        await using var reader = world.OpenContext();
        var successor = await reader.TodoItems.SingleAsync(item => item.ParentItemId == parent.Id && item.Id != child.Id);
        Assert.Null(successor.CompletedAtUtc);
        Assert.Equal(new DateOnly(2026, 11, 14), successor.DueDate);
    }

    [Fact]
    public async Task Undo_add_status_explains_when_a_completed_item_remembers_it()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Report");
        await world.Items.SetStatusAsync(item.Id, BuiltInLookups.CompletedId);
        await world.Lookups.AddStatusAsync("Reviewed", StatusKind.Open);
        var status = await FindStatusAsync(world, "Reviewed");
        await using (var writer = world.OpenContext())
        {
            await writer.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE TodoItem SET ReopenStatusId = {status.Id} WHERE Id = {item.Id}");
        }

        var problem = await Assert.ThrowsAsync<DomainRuleException>(() => world.History.UndoAsync());

        Assert.Contains("still used by an item", problem.Message);
        Assert.Equal(status.Id, (await world.ReadItemAsync(item.Id)).ReopenStatusId);
        Assert.Equal("Add status 'Reviewed'", world.History.UndoDescription);
    }

    private static async Task<StatusLevel> FindStatusAsync(UndoWorld world, string name)
    {
        return (await world.Lookups.StatusesAsync()).Single(status => status.Name == name);
    }

    /// <summary>Adds a Done status and moves it above Completed, so completing an item chooses it.</summary>
    private static async Task<StatusLevel> AddDoneStatusFirstAsync(UndoWorld world, string name)
    {
        await world.Lookups.AddStatusAsync(name, StatusKind.Done);
        var ids = (await world.Lookups.StatusesAsync()).Select(status => status.Id).ToList();
        var added = await FindStatusAsync(world, name);
        ids.Remove(added.Id);
        ids.Insert(ids.IndexOf(BuiltInLookups.CompletedId), added.Id);
        await world.Lookups.ReorderStatusesAsync(ids);
        return added;
    }

    private static async Task AddAtPriorityAsync(UndoWorld world, string title, Guid priorityId)
    {
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, title);
        await world.Items.SetPriorityAsync(item.Id, priorityId);
    }

    private static async Task<IReadOnlyList<ItemSearchResult>> SearchAsync(UndoWorld world, string text)
    {
        await using var database = world.OpenContext();
        var registry = new FieldRegistry(new TestUnitOfWorkFactory(database));
        var scope = new SearchScope.AllProjects();
        var fields = await registry.GetFieldsAsync(scope);
        var priority = fields.Single(field => field.Key == "priority");
        var choices = new Dictionary<string, IReadOnlyList<SearchChoice>> { ["priority"] = await registry.GetChoicesAsync(priority) };
        var parse = new ItemQueryParser(world.Clock, TimeZoneInfo.Utc).Parse(text, fields, choices);
        Assert.Empty(parse.Errors);
        var result = await world.Search.SearchAsync(new ItemQuery(scope, parse.Text, parse.Filters, parse.ImpliesIncludeCompleted));
        return result.Items;
    }
}