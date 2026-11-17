#pragma warning disable xUnit1051
using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Transfer.Csv;

namespace TaskTracker.Infrastructure.Tests.Transfer;

public sealed class CsvSafetyTests
{
    [Fact]
    public async Task A_custom_field_named_like_a_fixed_column_gets_a_suffixed_header_and_the_export_re_imports()
    {
        await using var world = await TransferWorld.CreateAsync();
        var source = await world.Projects.CreateAsync("Source");
        var type = await world.Fields.CreateAsync("Type", FieldDataType.Text, null);
        var ticket = await world.Fields.CreateAsync("TICKET", FieldDataType.Text, null);
        var item = await world.Items.CreateAsync(source.Id, null, null, "Colliding");
        var edit = new ItemEdit("Colliding", null, "T-1", BuiltInLookups.ChangeId, BuiltInLookups.HighId, null, null, null, null);
        await world.Items.EditAsync(item.Id, edit, [new FieldValueInput(type.Id, TextValue: "custom kind"), new FieldValueInput(ticket.Id, TextValue: "custom ticket")]);

        var csv = await world.Transfer.ExportProjectCsvAsync(source.Id);

        var header = CsvParser.Parse(csv).Records[0].Cells;
        Assert.Equal(header.Count, header.Distinct(StringComparer.OrdinalIgnoreCase).Count());
        Assert.Contains("Type (field)", header);
        Assert.Contains("TICKET (field)", header);
        var target = await world.Projects.CreateAsync("Target");
        var result = await world.Transfer.ImportCsvAsync(csv, target.Id, null);
        Assert.True(result.Succeeded, string.Join("; ", result.Issues));
        var copy = Assert.Single(await world.ReadItemsAsync(target.Id));
        Assert.Equal(BuiltInLookups.ChangeId, copy.ItemTypeId);
        Assert.Equal("T-1", copy.TicketNumber);
        var values = await world.ReadValuesAsync(copy.Id);
        Assert.Equal("custom kind", values.Single(value => value.FieldDefinitionId == type.Id).TextValue);
        Assert.Equal("custom ticket", values.Single(value => value.FieldDefinitionId == ticket.Id).TextValue);
    }

    [Fact]
    public async Task Text_cells_that_start_like_formulas_are_exported_with_a_leading_apostrophe()
    {
        await using var world = await TransferWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("=cmd");
        var notes = await world.Fields.CreateAsync("Notes", FieldDataType.Text, null);
        var item = await world.Items.CreateAsync(project.Id, null, null, "=HYPERLINK(\"x\")");
        var edit = new ItemEdit(item.Title, "+1 description", "@ticket", null, null, null, null, null, null);
        await world.Items.EditAsync(item.Id, edit, [new FieldValueInput(notes.Id, TextValue: "-2 note")]);
        var folder = await world.Folders.CreateAsync(project.Id, null, "@folder");
        await world.Items.MoveToAreaAsync(project.Id, null, folder.Id, item.Id);

        var table = CsvParser.Parse(await world.Transfer.ExportProjectCsvAsync(project.Id));

        var row = table.Records[0].Cells.Zip(table.Records[1].Cells).ToDictionary(pair => pair.First, pair => pair.Second);
        Assert.Equal("'=HYPERLINK(\"x\")", row["Title"]);
        Assert.Equal("'+1 description", row["Description"]);
        Assert.Equal("'@ticket", row["Ticket"]);
        Assert.Equal("'-2 note", row["Notes"]);
        Assert.Equal("'=cmd", row["Project"]);
        Assert.Equal("'@folder", row["Folder path"]);
    }

    [Fact]
    public async Task Protected_cells_import_back_to_the_original_text()
    {
        await using var world = await TransferWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Source");
        var notes = await world.Fields.CreateAsync("Notes", FieldDataType.Text, null);
        var item = await world.Items.CreateAsync(project.Id, null, null, "=SUM(1,2)");
        var edit = new ItemEdit(item.Title, "'=already quoted", "-9", null, null, null, null, null, null);
        await world.Items.EditAsync(item.Id, edit, [new FieldValueInput(notes.Id, TextValue: "@mention")]);
        var csv = await world.Transfer.ExportProjectCsvAsync(project.Id);
        var target = await world.Projects.CreateAsync("Target");

        var result = await world.Transfer.ImportCsvAsync(csv, target.Id, null);

        Assert.True(result.Succeeded, string.Join("; ", result.Issues));
        var copy = Assert.Single(await world.ReadItemsAsync(target.Id));
        Assert.Equal("=SUM(1,2)", copy.Title);
        Assert.Equal("'=already quoted", copy.Description);
        Assert.Equal("-9", copy.TicketNumber);
        Assert.Equal("@mention", Assert.Single(await world.ReadValuesAsync(copy.Id)).TextValue);
    }

    [Fact]
    public async Task A_hand_written_apostrophe_is_removed_only_in_front_of_a_formula_start()
    {
        await using var world = await TransferWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Target");

        await world.Transfer.ImportCsvAsync("Title,Description\r\n'=typed,'just a quote\r\n", project.Id, null);

        var item = Assert.Single(await world.ReadItemsAsync(project.Id));
        Assert.Equal("=typed", item.Title);
        Assert.Equal("'just a quote", item.Description);
    }

    [Fact]
    public async Task Numbers_and_dates_are_not_protected()
    {
        await using var world = await TransferWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Numbers");
        var estimate = await world.Fields.CreateAsync("Estimate", FieldDataType.Number, null);
        var item = await world.Items.CreateAsync(project.Id, null, null, "Negative");
        var edit = new ItemEdit("Negative", null, null, null, null, null, null, null, null);
        await world.Items.EditAsync(item.Id, edit, [new FieldValueInput(estimate.Id, NumberValue: -2.5)]);

        var table = CsvParser.Parse(await world.Transfer.ExportProjectCsvAsync(project.Id));

        Assert.Equal("-2.5", table.Records[1].Cells[^1]);
    }
}