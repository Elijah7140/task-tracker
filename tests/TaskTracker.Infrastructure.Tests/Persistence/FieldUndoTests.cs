#pragma warning disable xUnit1051
using TaskTracker.Core.Fields;

namespace TaskTracker.Infrastructure.Tests.Persistence;

/// <summary>SQLite replay and conflicts for custom field and choice management.</summary>
public sealed class FieldUndoTests
{
    [Theory]
    [InlineData("create")]
    [InlineData("rename")]
    [InlineData("change type")]
    [InlineData("archive")]
    [InlineData("unarchive")]
    [InlineData("reorder")]
    public async Task Field_changes_round_trip_and_refuse_a_changed_row(string operation)
    {
        await using var world = await UndoWorld.CreateAsync();
        var service = world.Fields;
        var first = await service.CreateAsync("First", FieldDataType.Text, null);
        var second = await service.CreateAsync("Second", FieldDataType.Text, null);
        if (operation == "unarchive")
        {
            await service.ArchiveAsync(first.Id);
        }

        await world.VerifyRoundTripAsync(
            () => EditFieldAsync(service, first.Id, second.Id, operation), "FieldDefinition");
        await world.VerifyRefusalAsync("UPDATE FieldDefinition SET SortOrder = 99 WHERE Key IN ('first', 'added')",
            redo: false, "FieldDefinition");
    }

    [Theory]
    [InlineData("add")]
    [InlineData("rename")]
    [InlineData("archive")]
    [InlineData("unarchive")]
    [InlineData("reorder")]
    public async Task Choice_changes_round_trip_and_refuse_a_changed_row(string operation)
    {
        await using var world = await UndoWorld.CreateAsync();
        var service = world.Fields;
        var field = await service.CreateAsync("Choice", FieldDataType.Choice, world.Project.Id);
        var first = await service.AddChoiceAsync(field.Id, "First");
        var second = await service.AddChoiceAsync(field.Id, "Second");
        if (operation == "unarchive")
        {
            await service.ArchiveChoiceAsync(field.Id, first.Id);
        }

        await world.VerifyRoundTripAsync(
            () => EditChoiceAsync(service, field.Id, first.Id, second.Id, operation), "FieldChoice");
        await world.VerifyRefusalAsync(
            "UPDATE FieldChoice SET SortOrder = 99 WHERE Label IN ('First', 'Renamed', 'Added')",
            redo: false, "FieldChoice");
    }

    private static Task EditFieldAsync(FieldService service, Guid first, Guid second, string operation)
    {
        return operation switch
        {
            "create" => service.CreateAsync("Added", FieldDataType.Text, null),
            "rename" => service.RenameAsync(first, "Renamed"),
            "change type" => service.ChangeTypeAsync(first, FieldDataType.Number),
            "archive" => service.ArchiveAsync(first),
            "unarchive" => service.UnarchiveAsync(first),
            "reorder" => service.ReorderAsync(null, [second, first]),
            _ => throw new ArgumentOutOfRangeException(nameof(operation))
        };
    }

    private static Task EditChoiceAsync(FieldService service, Guid field, Guid first, Guid second, string operation)
    {
        return operation switch
        {
            "add" => service.AddChoiceAsync(field, "Added"),
            "rename" => service.RenameChoiceAsync(field, first, "Renamed"),
            "archive" => service.ArchiveChoiceAsync(field, first),
            "unarchive" => service.UnarchiveChoiceAsync(field, first),
            "reorder" => service.ReorderChoicesAsync(field, [second, first]),
            _ => throw new ArgumentOutOfRangeException(nameof(operation))
        };
    }
}