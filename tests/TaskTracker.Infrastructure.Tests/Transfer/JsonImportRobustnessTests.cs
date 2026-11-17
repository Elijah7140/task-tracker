#pragma warning disable xUnit1051
using System.Text.Json.Nodes;

using TaskTracker.Core.Search;
using TaskTracker.Core.Transfer;
using TaskTracker.Infrastructure.Tests.Persistence;

namespace TaskTracker.Infrastructure.Tests.Transfer;

public sealed class JsonImportRobustnessTests
{
    public static TheoryData<string, string> NullElements => new()
    {
        { "projects", "$.projects[0]" },
        { "itemTypes", "$.itemTypes[0]" },
        { "priorityLevels", "$.priorityLevels[0]" },
        { "savedSearches", "$.savedSearches[0]" },
        { "fields", "$.fields[0]" },
        { "choices", ".choices[0]" },
        { "folders", "$.projects[0].folders[0]" },
        { "items", "$.projects[0].items[0]" },
        { "fieldValues", ".fieldValues[0]" }
    };

    [Theory]
    [MemberData(nameof(NullElements))]
    public async Task A_null_list_element_is_reported_with_its_path_instead_of_crashing(string list, string expectedPath)
    {
        await using var world = await TransferWorld.CreateAsync();
        var json = TransferJson.Edit(await ExportSeedAsync(), document => NullFirstElement(document, list));

        var check = world.Transfer.CheckJson(json);
        var result = await world.Transfer.ImportJsonAsync(json);

        Assert.False(check.IsValid);
        var issue = Assert.Single(check.Issues);
        Assert.EndsWith(expectedPath, issue.Path);
        Assert.Equal("must be an object", issue.Message);
        Assert.False(result.Succeeded);
        Assert.Equal(0, world.Backup.Count);
    }

    [Fact]
    public async Task A_leading_byte_order_mark_is_accepted()
    {
        await using var world = await TransferWorld.CreateAsync();
        var json = $"{(char)0xFEFF}{await ExportSeedAsync()}";

        var check = world.Transfer.CheckJson(json);
        var result = await world.Transfer.ImportJsonAsync(json);

        Assert.True(check.IsValid, string.Join("; ", check.Issues));
        Assert.True(result.Succeeded, string.Join("; ", result.Issues));
    }

    [Fact]
    public async Task A_title_that_fits_once_trimmed_is_imported_and_one_that_does_not_is_reported_with_its_path()
    {
        await using var world = await TransferWorld.CreateAsync();
        var json = await ExportSeedAsync();
        var padded = new string('a', 300) + new string(' ', 10);
        var fits = TransferJson.Edit(json, document => TransferJson.Item(document, "Replace router")["title"] = padded);
        var tooLong = TransferJson.Edit(json, document => TransferJson.Item(document, "Replace router")["title"] = new string('a', 301));

        var fitsResult = await world.Transfer.ImportJsonAsync(fits);
        var tooLongCheck = world.Transfer.CheckJson(tooLong);

        Assert.True(fitsResult.Succeeded, string.Join("; ", fitsResult.Issues));
        var home = (await world.ReadProjectsAsync()).Single(project => project.Name == "Home Lab");
        Assert.Equal(new string('a', 300), Assert.Single(await world.ReadItemsAsync(home.Id)).Title);
        Assert.Contains(tooLongCheck.Issues, issue => issue.Path.EndsWith(".title"));
    }

    [Fact]
    public async Task A_name_of_every_kind_is_measured_after_trimming_like_the_domain_does()
    {
        await using var world = await TransferWorld.CreateAsync();
        var json = TransferJson.Edit(await ExportSeedAsync(), document =>
        {
            var padding = new string(' ', 10);
            document["itemTypes"]!.AsArray()[3]!["name"] = new string('t', 300) + padding;
            document["priorityLevels"]!.AsArray()[4]!["name"] = new string('p', 300) + padding;
            TransferJson.Project(document, "Billing")["name"] = new string('b', 300) + padding;
        });

        var result = await world.Transfer.ImportJsonAsync(json);

        Assert.True(result.Succeeded, string.Join("; ", result.Issues));
    }

    [Fact]
    public async Task Imported_items_are_found_by_full_text_search()
    {
        await using var world = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(world);
        var json = await world.Transfer.ExportJsonAsync(new TransferScope.AllData());
        await using var target = await TransferWorld.CreateAsync();
        await target.Transfer.ImportJsonAsync(json);

        await using var context = target.Store.Open();
        var units = new TestUnitOfWorkFactory(context);
        var search = new ItemSearchService(units, new ItemQueryValidator(units));
        var found = await search.SearchAsync(new ItemQuery(new SearchScope.AllProjects(), "invoice", [], true));

        Assert.Equal("Fix invoice totals", Assert.Single(found.Items).Title);
    }

    [Fact]
    public async Task A_backup_that_cannot_be_made_stops_the_import_before_anything_is_saved()
    {
        await using var world = await TransferWorld.CreateAsync();
        var json = await ExportSeedAsync();
        world.Backup.Fail = true;
        var before = await world.CountRowsAsync();

        var failure = await Assert.ThrowsAsync<IOException>(() => world.Transfer.ImportJsonAsync(json));

        Assert.Contains("nothing was imported", failure.Message);
        Assert.Equal(before, await world.CountRowsAsync());
    }

    [Fact]
    public async Task A_backup_that_cannot_be_made_stops_a_csv_import_too()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);
        world.Backup.Fail = true;
        var before = await world.CountRowsAsync();

        await Assert.ThrowsAsync<IOException>(() => world.Transfer.ImportCsvAsync("Title\r\nx\r\n", ids.BillingId, null));

        Assert.Equal(before, await world.CountRowsAsync());
    }

    [Fact]
    public async Task A_large_hierarchy_imports()
    {
        await using var source = await TransferWorld.CreateAsync();
        var project = await source.Projects.CreateAsync("Wide");
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.SingleProject(project.Id));
        var edited = TransferJson.Edit(json, document => AddItems(document, 3000));
        await using var target = await TransferWorld.CreateAsync();

        var result = await target.Transfer.ImportJsonAsync(edited);

        Assert.True(result.Succeeded, string.Join("; ", result.Issues.Take(3)));
        Assert.Equal(3000, result.Summary.Items);
    }

    private static void AddItems(JsonObject document, int count)
    {
        var items = new JsonArray();
        var parentId = Guid.NewGuid();
        items.Add(new JsonObject { ["id"] = parentId, ["title"] = "Parent", ["sortOrder"] = 0 });

        for (var number = 1; number < count; number++)
        {
            items.Add(new JsonObject
            {
                ["id"] = Guid.NewGuid(),
                ["parentItemId"] = parentId,
                ["title"] = $"Child {number}",
                ["sortOrder"] = number
            });
        }

        document["projects"]![0]!["items"] = items;
    }

    private static void NullFirstElement(JsonObject document, string list)
    {
        var billing = TransferJson.Project(document, "Billing");
        var severity = document["fields"]!.AsArray().Single(field => field!["key"]!.GetValue<string>() == "severity")!;
        var fix = TransferJson.Item(document, "Fix invoice totals");
        var array = list switch
        {
            "choices" => severity["choices"]!.AsArray(),
            "folders" => billing["folders"]!.AsArray(),
            "items" => billing["items"]!.AsArray(),
            "fieldValues" => fix["fieldValues"]!.AsArray(),
            _ => document[list]!.AsArray()
        };

        array[0] = null;
    }

    private static async Task<string> ExportSeedAsync()
    {
        await using var world = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(world);

        return await world.Transfer.ExportJsonAsync(new TransferScope.AllData());
    }
}