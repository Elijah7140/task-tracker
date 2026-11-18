#pragma warning disable xUnit1051
using TaskTracker.Core.Lookups;

namespace TaskTracker.Infrastructure.Tests.Persistence;

/// <summary>SQLite replay and conflicts for item type and priority management.</summary>
public sealed class LookupUndoTests
{
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
        if (operation == "unarchive")
        {
            await service.ArchiveItemTypeAsync(type.Id);
        }

        var order = (await service.ItemTypesAsync()).Select(row => row.Id).Reverse().ToArray();
        await world.VerifyRoundTripAsync(() => EditItemTypeAsync(service, type.Id, order, operation), "ItemType");
        await world.VerifyRefusalAsync(
            "UPDATE ItemType SET SortOrder = 99 WHERE Name IN ('Custom', 'Renamed', 'Added')",
            redo: false, "ItemType");
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
        if (operation == "unarchive")
        {
            await service.ArchivePriorityLevelAsync(level.Id);
        }

        var order = (await service.PriorityLevelsAsync()).Select(row => row.Id).Reverse().ToArray();
        await world.VerifyRoundTripAsync(() => EditPriorityAsync(service, level.Id, order, operation), "PriorityLevel");
        await world.VerifyRefusalAsync("UPDATE PriorityLevel SET SortOrder = 99 WHERE Number = 42",
            redo: false, "PriorityLevel");
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