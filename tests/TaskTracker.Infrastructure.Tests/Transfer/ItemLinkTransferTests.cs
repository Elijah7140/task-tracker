#pragma warning disable xUnit1051
using System.Text.Json.Nodes;

using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.SavedSearches;
using TaskTracker.Core.Search;
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
    public async Task Legacy_json_searches_keep_their_custom_link_field_when_its_key_is_renamed()
    {
        await using var world = await TransferWorld.CreateAsync();
        var owner = await world.Projects.CreateAsync("Owner");
        var other = await world.Projects.CreateAsync("Other");
        await world.Fields.CreateAsync("Link", FieldDataType.Text, owner.Id);
        const string query = """ "has:link" has:" LINK " no:link LINK~wiki link:"see \"no:link\"" """;
        await world.SavedSearches.SaveAsync("Custom", new(query, new SearchScope.Project(owner.Id), false));
        await world.SavedSearches.SaveAsync("Built-in", new("has:link", new SearchScope.Project(other.Id), false));
        var json = await world.Transfer.ExportJsonAsync(new TransferScope.AllData());
        var legacy = TransferJson.Edit(json, document => document["fields"]![0]!["key"] = "link");

        var result = await world.Transfer.ImportJsonAsync(legacy);

        Assert.True(result.Succeeded, string.Join("; ", result.Issues));
        var searches = (await world.ReadSavedSearchesAsync()).ToDictionary(search => search.Name);
        Assert.Equal(""" "has:link" has:link-3 no:link-3 link-3~wiki link-3:"see \"no:link\"" """,
            searches["Custom (imported)"].QueryText);
        Assert.Equal("has:link", searches["Built-in (imported)"].QueryText);
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
        Assert.Equal(header.Count - 2 - 6, column);
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

    [Fact]
    public async Task Csv_round_trips_links_and_custom_fields_with_colliding_headers()
    {
        await using var world = await TransferWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Source");
        var suffixed = await world.Fields.CreateAsync("Links (field)", FieldDataType.Text, null);
        var plain = await world.Fields.CreateAsync("Links", FieldDataType.Text, null);
        var item = await world.Items.CreateAsync(project.Id, null, null, "Example");
        var edit = new ItemEdit(item.Title, null, null, null, null, null, null, null, null);
        await world.Items.EditAsync(item.Id, edit, [new(plain.Id, TextValue: "plain"), new(suffixed.Id, TextValue: "suffixed")],
            [new(null, "https://example.com", null)]);

        var csv = await world.Transfer.ExportProjectCsvAsync(project.Id);
        var target = await world.Projects.CreateAsync("Target");
        var result = await world.Transfer.ImportCsvAsync(csv, target.Id, null);

        var headers = CsvParser.Parse(csv).Records[0].Cells;
        Assert.Equal(["Links", "Repeats", "Links (field) (field)", "Links (field)"], headers.TakeLast(4));
        Assert.True(result.Succeeded, string.Join("; ", result.Issues));
        var imported = Assert.Single(await world.ReadItemsAsync(target.Id));
        var values = (await world.ReadValuesAsync(imported.Id)).ToDictionary(value => value.FieldDefinitionId);
        Assert.Equal("plain", values[plain.Id].TextValue);
        Assert.Equal("suffixed", values[suffixed.Id].TextValue);
        Assert.Equal([("https://example.com", null)], await ReadLinksAsync(world, "Example", target.Id));
    }

    [Fact]
    public async Task Legacy_csv_text_under_links_reports_the_ambiguous_header()
    {
        await using var world = await TransferWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Target");
        await world.Fields.CreateAsync("Links", FieldDataType.Text, project.Id);

        var result = await world.Transfer.ImportCsvAsync("Title,Links\r\nOne,internal wiki\r\n", project.Id, null);

        Assert.False(result.Succeeded);
        var issue = Assert.Single(result.Issues);
        Assert.Equal("Row 2, Links", issue.Path);
        Assert.Contains("ambiguous", issue.Message);
        Assert.Contains("Links (field)", issue.Message);
        Assert.Empty(await world.ReadItemsAsync(project.Id));
    }

    [Fact]
    public async Task An_overlong_csv_link_list_reports_only_the_count_error()
    {
        await using var world = await TransferWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Target");
        var urls = string.Join(' ', Enumerable.Repeat("https://example.com", LinkPolicy.MaxLinksPerItem));
        var csv = $"Title,Links\r\nOne,{urls} invalid another-invalid\r\n";

        var result = await world.Transfer.ImportCsvAsync(csv, project.Id, null);

        var issue = Assert.Single(result.Issues);
        Assert.Equal("Row 2, Links", issue.Path);
        Assert.Equal($"An item may have at most {LinkPolicy.MaxLinksPerItem} links.", issue.Message);
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