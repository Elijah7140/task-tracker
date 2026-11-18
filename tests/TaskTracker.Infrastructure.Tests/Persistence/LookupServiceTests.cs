using TaskTracker.Core.Items;

#pragma warning disable xUnit1051
using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Lookups;

namespace TaskTracker.Infrastructure.Tests.Persistence;

public sealed class LookupServiceTests
{
    [Fact]
    public async Task Added_renamed_and_reordered_lookups_persist()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var service = store.Lookups(writer);
        var type = await service.AddItemTypeAsync("Custom");
        var priority = await service.AddPriorityLevelAsync("Later");
        await service.RenameItemTypeAsync(type.Id, "Renamed");
        await service.RenamePriorityLevelAsync(priority.Id, "Someday");
        var types = await service.ItemTypesAsync();
        var levels = await service.PriorityLevelsAsync();
        await service.ReorderItemTypesAsync([type.Id, .. types.Where(row => row.Id != type.Id).Select(row => row.Id)]);
        await service.ReorderPriorityLevelsAsync([priority.Id, .. levels.Where(row => row.Id != priority.Id).Select(row => row.Id)]);

        await using var reader = store.Open();
        var savedTypes = await store.Lookups(reader).ItemTypesAsync();
        var savedLevels = await store.Lookups(reader).PriorityLevelsAsync();

        Assert.Equal("Renamed", savedTypes.Single(row => row.Id == type.Id).Name);
        Assert.Equal(0, savedTypes.Single(row => row.Id == type.Id).SortOrder);
        Assert.Equal("Someday", savedLevels.Single(row => row.Id == priority.Id).Name);
        Assert.Equal(0, savedLevels.Single(row => row.Id == priority.Id).SortOrder);
    }

    [Fact]
    public async Task Archived_lookups_remain_on_items_but_built_in_type_cannot_be_archived()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var lookups = store.Lookups(writer);
        var project = await store.Projects(writer).CreateAsync("Project");
        var item = await store.Items(writer).CreateAsync(project.Id, null, null, "Task");
        var type = await lookups.AddItemTypeAsync("Custom");
        var priority = await lookups.AddPriorityLevelAsync("Later");
        await store.Items(writer).EditAsync(item.Id, new ItemEdit("Task", null, null,
            type.Id, priority.Id, null, null, null, null));

        await Assert.ThrowsAsync<TaskTracker.Core.DomainRuleException>(() => lookups.ArchiveItemTypeAsync(BuiltInLookups.ChangeId));
        await lookups.ArchiveItemTypeAsync(type.Id);
        await lookups.ArchivePriorityLevelAsync(priority.Id);
        await using var reader = store.Open();
        var saved = await reader.TodoItems.SingleAsync();
        var snapshot = await store.Items(reader).LoadAreaAsync(project.Id, null);

        Assert.Equal(type.Id, saved.ItemTypeId);
        Assert.Equal(priority.Id, saved.PriorityLevelId);
        Assert.Contains(snapshot.ItemTypes, row => row.Id == type.Id && row.IsArchived);
        Assert.Contains(snapshot.PriorityLevels, row => row.Id == priority.Id && row.IsArchived);
    }

    [Fact]
    public async Task Adding_or_renaming_to_an_existing_name_is_rejected_ignoring_case()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var service = store.Lookups(writer);
        var custom = await service.AddItemTypeAsync("Custom");

        var added = await Assert.ThrowsAsync<TaskTracker.Core.DomainRuleException>(() =>
            service.AddItemTypeAsync(" custom "));
        var renamed = await Assert.ThrowsAsync<TaskTracker.Core.DomainRuleException>(() =>
            service.RenameItemTypeAsync(custom.Id, "Change"));

        Assert.Equal("The name 'custom' is already used by another item type.", added.Message);
        Assert.Equal("The name 'Change' is already used by another item type.", renamed.Message);
    }

    [Fact]
    public async Task Archived_names_stay_reserved_and_reusing_one_is_a_validation_error_not_a_database_error()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var service = store.Lookups(writer);
        var type = await service.AddItemTypeAsync("Review");
        var level = await service.AddPriorityLevelAsync("Later");
        await service.AddStatusAsync("Blocked", StatusKind.Open);
        var status = (await service.StatusesAsync()).Single(row => row.Name == "Blocked");
        await service.ArchiveItemTypeAsync(type.Id);
        await service.ArchivePriorityLevelAsync(level.Id);
        await service.SetStatusArchivedAsync(status.Id, archived: true);

        var addedType = await Assert.ThrowsAsync<TaskTracker.Core.DomainRuleException>(() => service.AddItemTypeAsync("review"));
        var addedLevel = await Assert.ThrowsAsync<TaskTracker.Core.DomainRuleException>(() => service.AddPriorityLevelAsync("LATER"));
        var renamedStatus = await Assert.ThrowsAsync<TaskTracker.Core.DomainRuleException>(() =>
            service.RenameStatusAsync(BuiltInLookups.CompletedId, "blocked"));

        Assert.Equal("The name 'review' is used by an archived item type. Restore it instead.", addedType.Message);
        Assert.Equal("The name 'LATER' is used by an archived priority level. Restore it instead.", addedLevel.Message);
        Assert.Equal("The name 'blocked' is used by an archived status. Restore it instead.", renamedStatus.Message);
    }

    [Fact]
    public async Task Renaming_a_lookup_to_its_own_name_is_allowed()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var service = store.Lookups(writer);
        var level = await service.AddPriorityLevelAsync("Later");

        await service.RenamePriorityLevelAsync(level.Id, "later");
        await using var reader = store.Open();

        Assert.Contains(await store.Lookups(reader).PriorityLevelsAsync(), row => row.Name == "later");
    }
}