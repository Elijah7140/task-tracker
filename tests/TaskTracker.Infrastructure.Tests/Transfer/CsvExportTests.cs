#pragma warning disable xUnit1051
using TaskTracker.Core;
using TaskTracker.Core.Search;
using TaskTracker.Core.Transfer.Csv;
using TaskTracker.Infrastructure.Tests.Persistence;

namespace TaskTracker.Infrastructure.Tests.Transfer;

public sealed class CsvExportTests
{
    private static readonly string[] StandardHeader =
    [
        "Title", "Description", "Ticket", "Type", "Priority", "Status", "Due date", "Due time", "Scheduled start",
        "Scheduled end", "Completed", "Completed at", "Project", "Folder path", "Parent title", "Links", "Repeats"
    ];

    [Fact]
    public async Task The_header_has_the_standard_columns_then_one_per_custom_field_by_display_name()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);

        var table = await ExportAsync(world, ids.BillingId);

        var header = table.Records[0].Cells;
        Assert.Equal(StandardHeader, header.Take(StandardHeader.Length));
        Assert.Equal(["Severity", "Estimate", "Reviewed", "Flag", "Notes", "Customer"], header.Skip(StandardHeader.Length));
    }

    [Fact]
    public async Task Items_are_written_in_screen_order_with_folder_path_and_parent_title()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);

        var table = await ExportAsync(world, ids.BillingId);

        var titles = table.Records.Skip(1).Select(record => record.Cells[0]);
        Assert.Equal(["Fix invoice totals", "Check query plan", "Write regression test", "Add index"], titles);
        var sub = Row(table, "Check query plan");
        Assert.Equal("Fix invoice totals", sub["Parent title"]);
        Assert.Equal(string.Empty, sub["Folder path"]);
        Assert.Equal("dbo/Tables", Row(table, "Add index")["Folder path"]);
        Assert.Equal("Billing", sub["Project"]);
    }

    [Fact]
    public async Task Dates_times_and_completion_are_written_in_invariant_iso_form()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);

        var table = await ExportAsync(world, ids.BillingId);

        var fix = Row(table, "Fix invoice totals");
        Assert.Equal("2026-11-20", fix["Due date"]);
        Assert.Equal("15:00:00", fix["Due time"]);
        Assert.Equal("no", fix["Completed"]);
        Assert.Equal(string.Empty, fix["Completed at"]);
        var addIndex = Row(table, "Add index");
        Assert.Equal("2026-11-21T09:00:00", addIndex["Scheduled start"]);
        Assert.Equal("2026-11-21T10:30:00", addIndex["Scheduled end"]);
        Assert.Equal("yes", addIndex["Completed"]);
        Assert.EndsWith("Z", addIndex["Completed at"]);
    }

    [Fact]
    public async Task Type_priority_and_custom_values_are_written_as_names_and_invariant_text()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);

        var table = await ExportAsync(world, ids.BillingId);

        var fix = Row(table, "Fix invoice totals");
        Assert.Equal("Change", fix["Type"]);
        Assert.Equal("High", fix["Priority"]);
        Assert.Equal("Major", fix["Severity"]);
        Assert.Equal("2.5", fix["Estimate"]);
        Assert.Equal("2026-11-01", fix["Reviewed"]);
        Assert.Equal("yes", fix["Flag"]);
        Assert.Equal("Acme, Inc.", fix["Customer"]);
        Assert.Equal("JIRA-1", fix["Ticket"]);
    }

    [Fact]
    public async Task Descriptions_with_commas_quotes_and_line_breaks_survive_parsing()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);

        var table = await ExportAsync(world, ids.BillingId);

        Assert.Equal("Totals are wrong,\nsee the \"Q4\" report", Row(table, "Fix invoice totals")["Description"]);
    }

    [Fact]
    public async Task Deleted_items_are_left_out()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);

        var table = await ExportAsync(world, ids.BillingId);

        Assert.DoesNotContain(table.Records, record => record.Cells[0] == "Old idea");
    }

    [Fact]
    public async Task An_archived_field_gets_a_column_only_when_an_exported_item_has_a_value()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);

        var table = await ExportAsync(world, ids.HomeLabId);

        var header = table.Records[0].Cells;
        Assert.DoesNotContain("Old note", header);
        Assert.DoesNotContain("Customer", header);
        Assert.Contains("Severity", header);
    }

    [Fact]
    public async Task The_export_text_is_the_same_under_another_culture()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);
        var english = await world.Transfer.ExportProjectCsvAsync(ids.BillingId);

        using var german = TransferCulture.Use("de-DE");
        var germanText = await world.Transfer.ExportProjectCsvAsync(ids.BillingId);

        Assert.Equal(english, germanText);
        Assert.Contains("2.5", germanText);
        Assert.DoesNotContain("2,5", germanText);
    }

    [Fact]
    public async Task Lines_end_with_crlf_and_the_text_has_no_byte_order_mark()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);

        var text = await world.Transfer.ExportProjectCsvAsync(ids.HomeLabId);

        Assert.EndsWith("\r\n", text);
        Assert.NotEqual((char)0xFEFF, text[0]);
        Assert.Equal([0xEF, 0xBB, 0xBF], CsvFormat.Utf8WithBom.GetPreamble());
    }

    [Fact]
    public async Task Search_results_are_written_in_result_order_and_skip_items_deleted_since()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);
        var found = await SearchAllAsync(world);
        var reversed = found.Reverse().ToList();
        var gone = reversed[0];
        await world.Items.DeleteAsync(gone.ProjectId, gone.FolderId, gone.ItemId);

        var text = await world.Transfer.ExportResultsCsvAsync(reversed);

        var table = CsvParser.Parse(text);
        var titles = table.Records.Skip(1).Select(record => record.Cells[0]).ToList();
        Assert.Equal(reversed.Skip(1).Select(result => result.Title), titles);
        Assert.Equal(ids.LabItemId, found.Single(result => result.Title == "Replace router").ItemId);
    }

    [Fact]
    public async Task Exporting_a_deleted_project_is_refused()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);

        await Assert.ThrowsAsync<DomainRuleException>(() => world.Transfer.ExportProjectCsvAsync(ids.TrashedProjectId));
    }

    private static async Task<IReadOnlyList<ItemSearchResult>> SearchAllAsync(TransferWorld world)
    {
        await using var context = world.Store.Open();
        var units = new TestUnitOfWorkFactory(context);
        var search = new ItemSearchService(units, new ItemQueryValidator(units));
        var query = new ItemQuery(new SearchScope.AllProjects(), null, [], true);
        var results = await search.SearchAsync(query, 100);

        return results.Items;
    }

    private static async Task<CsvTable> ExportAsync(TransferWorld world, Guid projectId)
    {
        return CsvParser.Parse(await world.Transfer.ExportProjectCsvAsync(projectId));
    }

    private static Dictionary<string, string> Row(CsvTable table, string title)
    {
        var header = table.Records[0].Cells;
        var record = table.Records.Skip(1).Single(candidate => candidate.Cells[0] == title);

        return header.Zip(record.Cells).ToDictionary(pair => pair.First, pair => pair.Second);
    }
}