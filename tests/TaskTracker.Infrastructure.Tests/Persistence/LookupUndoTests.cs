#pragma warning disable xUnit1051
using TaskTracker.Core;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Transfer;

namespace TaskTracker.Infrastructure.Tests.Persistence;

/// <summary>SQLite replay and conflicts for item type and priority management.</summary>
public sealed class LookupUndoTests
{
    [Theory]
    [InlineData("ItemType")]
    [InlineData("PriorityLevel")]
    [InlineData("StatusLevel")]
    public async Task Redo_refuses_a_rank_now_used_by_an_imported_lookup(string kind)
    {
        await using var world = await UndoWorld.CreateAsync();
        await using var source = await UndoWorld.CreateAsync();
        await AddLookupAsync(world.Lookups, kind, "Original");
        await world.History.UndoAsync();
        await AddLookupAsync(source.Lookups, kind, "Imported");
        await ImportAsync(world, source);
        var before = await world.SnapshotTablesAsync([kind]);

        var error = await Assert.ThrowsAsync<DomainRuleException>(() => world.History.RedoAsync());

        Assert.Contains("rank", error.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(before, await world.SnapshotTablesAsync([kind]));
        Assert.True(world.History.CanRedo);
    }

    [Theory]
    [InlineData("ItemType")]
    [InlineData("PriorityLevel")]
    [InlineData("StatusLevel")]
    public async Task Undo_refuses_an_archived_lookup_name_with_different_unicode_case(string kind)
    {
        await using var world = await UndoWorld.CreateAsync();
        await using var source = await UndoWorld.CreateAsync();
        var original = await AddLookupAsync(world.Lookups, kind, "Ürgent");
        await RenameLookupAsync(world.Lookups, kind, original.Id, "Review");
        var imported = await AddLookupAsync(source.Lookups, kind, "ürgent");
        await ArchiveLookupAsync(source.Lookups, kind, imported.Id);
        await ImportAsync(world, source);
        var before = await world.SnapshotTablesAsync([kind]);

        var error = await Assert.ThrowsAsync<DomainRuleException>(() => world.History.UndoAsync());

        Assert.Contains("name", error.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(before, await world.SnapshotTablesAsync([kind]));
        Assert.True(world.History.CanUndo);
        Assert.False(world.History.CanRedo);
    }

    [Fact]
    public async Task Redo_refuses_a_priority_number_now_used_by_another_active_level()
    {
        await using var world = await UndoWorld.CreateAsync();
        var original = await world.Lookups.AddPriorityLevelAsync("Original");
        await world.Lookups.SetPriorityNumberAsync(original.Id, 42);
        await world.History.UndoAsync();

        var message = await world.VerifyRefusalAsync("UPDATE PriorityLevel SET Number = 42 WHERE Name = 'Low'",
            redo: true, "PriorityLevel");

        Assert.Contains("Priority number 42", message, StringComparison.Ordinal);
    }

    private static async Task ImportAsync(UndoWorld target, UndoWorld source)
    {
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.AllData());
        Assert.True((await target.Transfer.ImportJsonAsync(json)).Succeeded);
    }

    private static async Task<LookupEntity> AddLookupAsync(LookupService service, string kind, string name)
    {
        if (kind == "StatusLevel")
        {
            await service.AddStatusAsync(name, StatusKind.Open);
            return (await service.StatusesAsync()).Single(status => status.Name == name);
        }

        return kind switch
        {
            "ItemType" => await service.AddItemTypeAsync(name),
            _ => await service.AddPriorityLevelAsync(name)
        };
    }

    private static Task RenameLookupAsync(LookupService service, string kind, Guid id, string name)
    {
        return kind switch
        {
            "ItemType" => service.RenameItemTypeAsync(id, name),
            "PriorityLevel" => service.RenamePriorityLevelAsync(id, name),
            _ => service.RenameStatusAsync(id, name)
        };
    }

    private static Task ArchiveLookupAsync(LookupService service, string kind, Guid id)
    {
        return kind switch
        {
            "ItemType" => service.ArchiveItemTypeAsync(id),
            "PriorityLevel" => service.ArchivePriorityLevelAsync(id),
            _ => service.SetStatusArchivedAsync(id, true)
        };
    }

    [Theory]
    [InlineData("add")]
    [InlineData("rename")]
    [InlineData("archive")]
    [InlineData("unarchive")]
    [InlineData("reorder")]
    public async Task Item_type_changes_round_trip_and_refuse_a_changed_row(string operation)
    {
        await using var world = await UndoWorld.CreateAsync();
        var service = world.Lookups;
        var type = await service.AddItemTypeAsync("Custom");
        await CreateReferencedItemAsync(world, itemTypeId: type.Id);
        if (operation == "unarchive")
        {
            await service.ArchiveItemTypeAsync(type.Id);
        }

        var order = (await service.ItemTypesAsync()).Select(row => row.Id).Reverse().ToArray();
        await world.VerifyRoundTripAsync(() => EditItemTypeAsync(service, type.Id, order, operation), "ItemType", "TodoItem");
        await world.VerifyRefusalAsync(
            "UPDATE ItemType SET SortOrder = 99 WHERE Name IN ('Custom', 'Renamed', 'Added')",
            redo: false, "ItemType", "TodoItem");
    }

    [Theory]
    [InlineData("rename")]
    [InlineData("archive")]
    [InlineData("unarchive")]
    [InlineData("reorder")]
    public async Task Priority_changes_round_trip_and_refuse_a_changed_row(string operation)
    {
        await using var world = await UndoWorld.CreateAsync();
        var service = world.Lookups;
        var level = await service.AddPriorityLevelAsync("Custom", 42);
        await CreateReferencedItemAsync(world, priorityId: level.Id);
        if (operation == "unarchive")
        {
            await service.ArchivePriorityLevelAsync(level.Id);
        }

        var order = (await service.PriorityLevelsAsync()).Select(row => row.Id).Reverse().ToArray();
        await world.VerifyRoundTripAsync(() => EditPriorityAsync(service, level.Id, order, operation), "PriorityLevel", "TodoItem");
        await world.VerifyRefusalAsync("UPDATE PriorityLevel SET SortOrder = 99 WHERE Number = 42",
            redo: false, "PriorityLevel", "TodoItem");
    }

    [Fact]
    public async Task Status_changes_preserve_current_and_reopen_references()
    {
        await using var world = await UndoWorld.CreateAsync();
        var service = world.Lookups;
        var status = await AddLookupAsync(service, "StatusLevel", "Review");
        var open = await world.Items.CreateAsync(world.Project.Id, null, null, "Current status");
        var done = await world.Items.CreateAsync(world.Project.Id, null, null, "Reopen status");
        await world.Items.SetStatusAsync(open.Id, status.Id);
        await world.Items.SetStatusAsync(done.Id, status.Id);
        await world.Items.SetCompletedAsync(world.Project.Id, null, done.Id, true);

        await world.VerifyRoundTripAsync(() => service.SetStatusArchivedAsync(status.Id, true), "StatusLevel", "TodoItem");

        Assert.Equal(status.Id, (await world.ReadItemAsync(open.Id)).StatusId);
        Assert.Equal(status.Id, (await world.ReadItemAsync(done.Id)).ReopenStatusId);
    }

    private static async Task CreateReferencedItemAsync(UndoWorld world, Guid? itemTypeId = null, Guid? priorityId = null)
    {
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        var edit = new ItemEdit("Task", "Description", "T-1", itemTypeId, priorityId, null, null, null, null);
        await world.Items.EditAsync(item.Id, edit);
    }

    private static Task EditItemTypeAsync(LookupService service, Guid id, Guid[] order, string operation)
    {
        return operation switch
        {
            "add" => service.AddItemTypeAsync("Added"),
            "rename" => service.RenameItemTypeAsync(id, "Renamed"),
            "archive" => service.ArchiveItemTypeAsync(id),
            "unarchive" => service.UnarchiveItemTypeAsync(id),
            "reorder" => service.ReorderItemTypesAsync(order),
            _ => throw new ArgumentOutOfRangeException(nameof(operation))
        };
    }

    private static Task EditPriorityAsync(LookupService service, Guid id, Guid[] order, string operation)
    {
        return operation switch
        {
            "rename" => service.RenamePriorityLevelAsync(id, "Renamed"),
            "archive" => service.ArchivePriorityLevelAsync(id),
            "unarchive" => service.UnarchivePriorityLevelAsync(id),
            "reorder" => service.ReorderPriorityLevelsAsync(order),
            _ => throw new ArgumentOutOfRangeException(nameof(operation))
        };
    }
}