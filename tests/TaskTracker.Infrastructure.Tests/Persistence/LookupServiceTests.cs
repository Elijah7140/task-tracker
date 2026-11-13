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
        Assert.DoesNotContain(snapshot.ItemTypes, row => row.Id == type.Id);
        Assert.DoesNotContain(snapshot.PriorityLevels, row => row.Id == priority.Id);
    }
}