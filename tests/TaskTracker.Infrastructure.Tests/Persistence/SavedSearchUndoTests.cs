#pragma warning disable xUnit1051
using TaskTracker.Core.SavedSearches;
using TaskTracker.Core.Search;

namespace TaskTracker.Infrastructure.Tests.Persistence;

/// <summary>SQLite replay and conflicts for every saved search write.</summary>
public sealed class SavedSearchUndoTests
{
    [Theory]
    [InlineData("save")]
    [InlineData("replace")]
    [InlineData("rename")]
    [InlineData("reorder")]
    [InlineData("delete")]
    public async Task Saved_search_changes_round_trip_and_refuse_a_changed_row(string operation)
    {
        await using var world = await UndoWorld.CreateAsync();
        var service = world.SavedSearches;
        var first = await service.SaveAsync("First", Definition("first"));
        var second = await service.SaveAsync("Second", Definition("second"));

        await world.VerifyRoundTripAsync(
            () => EditAsync(service, first.Id, second.Id, operation), "SavedSearch");

        var deleting = operation == "delete";
        if (deleting)
        {
            await world.History.UndoAsync();
        }

        await world.VerifyRefusalAsync(
            "UPDATE SavedSearch SET QueryText = 'external' WHERE Name IN ('First', 'Added', 'Renamed')",
            redo: deleting, "SavedSearch");
    }

    private static Task EditAsync(SavedSearchService service, Guid first, Guid second, string operation)
    {
        return operation switch
        {
            "save" => service.SaveAsync("Added", Definition("added")),
            "replace" => service.SaveAsync("First", Definition("replaced"), overwrite: true),
            "rename" => service.RenameAsync(first, "Renamed"),
            "reorder" => service.ReorderAsync([second, first]),
            "delete" => service.DeleteAsync(first),
            _ => throw new ArgumentOutOfRangeException(nameof(operation))
        };
    }

    private static SavedSearchDefinition Definition(string query)
    {
        return new SavedSearchDefinition(query, new SearchScope.AllProjects(), true);
    }
}