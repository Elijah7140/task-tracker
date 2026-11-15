#pragma warning disable xUnit1051
using System.Text.Json.Nodes;

using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Items;
using TaskTracker.Core.Transfer;
using TaskTracker.Core.Transfer.Csv;

namespace TaskTracker.Infrastructure.Tests.Transfer;

/// <summary>Item links in JSON and CSV export and import (§7.9, §7.10).</summary>
public sealed class ItemLinkTransferTests
{
    [Fact]
    public async Task Links_are_exported_in_order_and_survive_the_json_round_trip()
    {
        await using var source = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(source);
        await SetLinksAsync(source, ids.FixItemId, ("https://a.example", "Aye"), ("mailto:team@example.com", null));
        var first = await source.Transfer.ExportJsonAsync(new TransferScope.AllData());
        await using var target = await TransferWorld.CreateAsync();

        var result = await target.Transfer.ImportJsonAsync(first);
        var second = await target.Transfer.ExportJsonAsync(new TransferScope.AllData());

        Assert.True(result.Succeeded, string.Join("; ", result.Issues));
        Assert.Equal(TransferJson.WithoutIds(first), TransferJson.WithoutIds(second));
        var imported = await ReadLinksAsync(target, "Fix invoice totals");
        Assert.Equal([("https://a.example", "Aye"), ("mailto:team@example.com", null)], imported);
    }

    [Fact]
    public async Task The_json_has_a_links_array_only_for_items_that_have_links()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);
        await SetLinksAsync(world, ids.FixItemId, ("https://a.example", null));

        var json = TransferJson.Parse(await world.Transfer.ExportJsonAsync(new TransferScope.AllData()));

        var withLinks = TransferJson.Item(json, "Fix invoice totals");
        Assert.Equal("https://a.example", withLinks["links"]![0]!["url"]!.GetValue<string>());
        Assert.Null(withLinks["links"]![0]!["title"]);
        Assert.Single((JsonArray)withLinks["links"]!);
        Assert.Null(TransferJson.Item(json, "Add index")["links"]);
        Assert.Equal(1, json["version"]!.GetValue<int>());
    }

    [Fact]
    public async Task A_version_1_file_without_links_still_imports()
    {
        await using var source = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(source);
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.AllData());
        await using var target = await TransferWorld.CreateAsync();

        var result = await target.Transfer.ImportJsonAsync(json);

        Assert.True(result.Succeeded);
        Assert.Empty(await ReadLinksAsync(target, "Fix invoice totals"));
    }

    [Fact]
    public async Task Soft_deleted_items_links_are_not_exported()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);
        await SetLinksAsync(world, ids.FixItemId, ("https://gone.example", null));
        await world.Items.DeleteAsync(ids.BillingId, null, ids.FixItemId);

        var json = await world.Transfer.ExportJsonAsync(new TransferScope.AllData());

        Assert.DoesNotContain("gone.example", json);
    }

    [Theory]
    [InlineData("file:///C:/secrets.txt", "A link must be a full http, https or mailto address.")]
    [InlineData("", "Enter a link address.")]
    public async Task A_bad_link_in_a_file_is_reported_with_its_path(string url, string message)
    {
        await using var source = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(source);
        await SetLinksAsync(source, ids.FixItemId, ("https://a.example", null));
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.SingleProject(ids.BillingId));
        var edited = TransferJson.Edit(json, document =>
            TransferJson.Item(document, "Fix invoice totals")["links"]![0]!["url"] = url);
        await using var target = await TransferWorld.CreateAsync();

        var result = await target.Transfer.ImportJsonAsync(edited);

        Assert.False(result.Succeeded);
        var issue = Assert.Single(result.Issues);
        Assert.EndsWith(".links[0]", issue.Path);
        Assert.Equal(message, issue.Message);
        Assert.Equal(0, (await target.CountRowsAsync()).Items);
    }

    [Fact]
    public async Task A_null_link_entry_is_reported_as_not_an_object()
    {
        await using var source = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(source);
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.SingleProject(ids.BillingId));
        var edited = TransferJson.Edit(json, document =>
            TransferJson.Item(document, "Fix invoice totals")["links"] = new JsonArray([(JsonNode?)null]));
        await using var target = await TransferWorld.CreateAsync();

        var result = await target.Transfer.ImportJsonAsync(edited);

        var issue = Assert.Single(result.Issues);
        Assert.EndsWith(".links[0]", issue.Path);
        Assert.Equal("must be an object", issue.Message);
    }

    [Fact]
    public async Task Too_many_links_in_a_file_are_refused()
    {
        await using var source = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(source);
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.SingleProject(ids.BillingId));
        var edited = TransferJson.Edit(json, document =>
        {
            var links = new JsonArray();

            for (var number = 0; number <= LinkPolicy.MaxLinksPerItem; number++)
            {
                links.Add(new JsonObject { ["url"] = $"https://e.example/{number}" });
            }

            TransferJson.Item(document, "Fix invoice totals")["links"] = links;
        });
        await using var target = await TransferWorld.CreateAsync();

        var result = await target.Transfer.ImportJsonAsync(edited);

        Assert.False(result.Succeeded);
    }

    [Fact]
    public async Task The_csv_has_a_links_column_with_addresses_separated_by_spaces()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);
        await SetLinksAsync(world, ids.FixItemId, ("https://a.example", "Aye"), ("https://b.example/x?y=1", null));

        var table = CsvParser.Parse(await world.Transfer.ExportProjectCsvAsync(ids.BillingId));

        var header = table.Records[0].Cells;
        var column = header.ToList().IndexOf("Links");
        Assert.Equal(header.Count - 1 - 6, column);
        var rows = table.Records.Skip(1).ToDictionary(record => record.Cells[0], record => record.Cells[column]);
        Assert.Equal("https://a.example https://b.example/x?y=1", rows["Fix invoice totals"]);
        Assert.Equal(string.Empty, rows["Add index"]);
    }

    [Fact]
    public async Task Csv_links_round_trip_as_addresses_without_titles()
    {
        await using var source = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(source);
        await SetLinksAsync(source, ids.FixItemId, ("https://a.example", "Aye"), ("mailto:team@example.com", null));
        var csv = await source.Transfer.ExportProjectCsvAsync(ids.BillingId);
        var target = source;
        var project = await target.Projects.CreateAsync("Target");

        var result = await target.Transfer.ImportCsvAsync(csv, project.Id, null);

        Assert.True(result.Succeeded, string.Join("; ", result.Issues));
        var links = await ReadLinksAsync(target, "Fix invoice totals", project.Id);
        Assert.Equal([("https://a.example", null), ("mailto:team@example.com", null)], links);
    }

    [Fact]
    public async Task The_csv_preview_reports_the_links_column_as_recognised()
    {
        await using var world = await TransferWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Target");

        var preview = await world.Transfer.PreviewCsvAsync("Title,Links\r\nOne,https://a.example\r\n", project.Id, null);

        Assert.Contains("Links", preview.RecognizedColumns);
        Assert.True(preview.CanImport);
    }

    [Theory]
    [InlineData("https://a.example file:///C:/x")]
    [InlineData("not-a-link")]
    public async Task A_bad_csv_link_is_an_error_naming_row_and_column(string cell)
    {
        await using var world = await TransferWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Target");

        var result = await world.Transfer.ImportCsvAsync($"Title,Links\r\nOne,{cell}\r\n", project.Id, null);

        Assert.False(result.Succeeded);
        Assert.Contains(result.Issues, issue => issue.Path == "Row 2, Links");
    }

    [Fact]
    public async Task A_custom_field_named_links_gets_a_field_suffix_in_the_csv_header()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);
        await world.Fields.CreateAsync("Links", TaskTracker.Core.Fields.FieldDataType.Text, null);

        var table = CsvParser.Parse(await world.Transfer.ExportProjectCsvAsync(ids.BillingId));

        Assert.Contains("Links (field)", table.Records[0].Cells);
        Assert.Single(table.Records[0].Cells, "Links");
    }

    private static async Task SetLinksAsync(TransferWorld world, Guid itemId, params (string Url, string? Title)[] links)
    {
        await using var reader = world.Store.Open();
        var item = await reader.TodoItems.AsNoTracking().SingleAsync(row => row.Id == itemId);
        var edit = new ItemEdit(item.Title, item.Description, item.TicketNumber, item.ItemTypeId, item.PriorityLevelId,
            item.DueDate, item.DueTime, item.ScheduledStart, item.ScheduledEnd);
        var inputs = links.Select(link => new ItemLinkInput(null, link.Url, link.Title)).ToList();
        await world.Items.EditAsync(itemId, edit, [], inputs);
    }

    private static async Task<List<(string Url, string? Title)>> ReadLinksAsync(TransferWorld world, string itemTitle,
        Guid? projectId = null)
    {
        await using var reader = world.Store.Open();
        var itemId = (await reader.TodoItems.AsNoTracking().FirstAsync(item => item.Title == itemTitle && (projectId == null || item.ProjectId == projectId))).Id;
        var links = await reader.ItemLinks.AsNoTracking().Where(link => link.ItemId == itemId)
            .OrderBy(link => link.SortOrder).ToListAsync();

        return links.Select(link => (link.Url, link.Title)).ToList();
    }
}