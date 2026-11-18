#pragma warning disable xUnit1051
using System.Text.Json.Nodes;

using TaskTracker.Core.Lookups;
using TaskTracker.Core.SavedSearches;
using TaskTracker.Core.Search;
using TaskTracker.Core.Transfer;

namespace TaskTracker.Infrastructure.Tests.Transfer;

public sealed class StatusTransferTests
{
    [Fact]
    public async Task Json_round_trips_both_status_references_and_number_only_priority()
    {
        await using var source = await TransferWorld.CreateAsync();
        await using var target = await TransferWorld.CreateAsync();
        var project = await source.Projects.CreateAsync("Release");
        var item = await source.Items.CreateAsync(project.Id, null, null, "Review");
        await source.Lookups.AddStatusAsync("Verification", StatusKind.Open);
        var oldStatus = (await source.Lookups.StatusesAsync()).Single(status => status.Name == "Verification");
        var priority = await source.Lookups.AddPriorityLevelAsync(string.Empty, 7);
        await source.Items.SetPriorityAsync(item.Id, priority.Id);
        await source.Items.SetStatusAsync(item.Id, oldStatus.Id);
        await source.Items.SetStatusAsync(item.Id, BuiltInLookups.CompletedId);
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.SingleProject(project.Id));

        var result = await target.Transfer.ImportJsonAsync(json);

        Assert.Empty(result.Issues);
        var importedProject = Assert.Single(await target.ReadProjectsAsync());
        var imported = Assert.Single(await target.ReadItemsAsync(importedProject.Id));
        var importedOpen = (await target.Lookups.StatusesAsync()).Single(status => status.Name == "Verification");
        Assert.NotEqual(oldStatus.Id, importedOpen.Id);
        Assert.Equal(importedOpen.Id, imported.ReopenStatusId);
        Assert.Equal(BuiltInLookups.CompletedId, imported.StatusId);
        var importedPriority = (await target.Lookups.PriorityLevelsAsync()).Single(level => level.Id == imported.PriorityLevelId);
        Assert.Equal("7", importedPriority.Label);
    }

    [Fact]
    public async Task Invalid_status_references_report_item_paths()
    {
        await using var world = await TransferWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Release");
        await world.Items.CreateAsync(project.Id, null, null, "Review");
        var json = await world.Transfer.ExportJsonAsync(new TransferScope.SingleProject(project.Id));
        var document = JsonNode.Parse(json)!;
        var item = document["projects"]![0]!["items"]![0]!;
        item["statusId"] = Guid.CreateVersion7();
        item["reopenStatusId"] = Guid.CreateVersion7();

        var result = await world.Transfer.ImportJsonAsync(document.ToJsonString());

        Assert.Contains(result.Issues, issue => issue.Path == "$.projects[0].items[0].statusId");
        Assert.Contains(result.Issues, issue => issue.Path == "$.projects[0].items[0].reopenStatusId");
    }

    [Fact]
    public async Task Json_status_whose_name_matches_a_status_of_another_kind_is_reported()
    {
        await using var source = await TransferWorld.CreateAsync();
        await using var target = await TransferWorld.CreateAsync();
        var project = await source.Projects.CreateAsync("Release");
        var item = await source.Items.CreateAsync(project.Id, null, null, "Review");
        await source.Lookups.AddStatusAsync("Verified", StatusKind.Open);
        await source.Items.SetStatusAsync(item.Id, (await FindStatusAsync(source, "Verified")).Id);
        await target.Lookups.AddStatusAsync("Verified", StatusKind.Done);
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.SingleProject(project.Id));

        var result = await target.Transfer.ImportJsonAsync(json);

        var issue = Assert.Single(result.Issues);
        Assert.Matches(@"^\$\.statuses\[\d+\]\.kind$", issue.Path);
        Assert.Empty(await target.ReadProjectsAsync());
    }

    [Fact]
    public async Task Legacy_json_without_statuses_completes_with_the_first_Done_status_and_renames_the_old_key()
    {
        await using var source = await TransferWorld.CreateAsync();
        await using var target = await TransferWorld.CreateAsync();
        var project = await source.Projects.CreateAsync("Release");
        var item = await source.Items.CreateAsync(project.Id, null, null, "Shipped");
        await source.Items.SetCompletedAsync(project.Id, null, item.Id, true);
        var scope = new SearchScope.AllProjects();
        await source.SavedSearches.SaveAsync("Done", new SavedSearchDefinition("completed:true", scope, true));
        var document = JsonNode.Parse(await source.Transfer.ExportJsonAsync(new TransferScope.AllData()))!.AsObject();
        RemoveStatuses(document);

        var result = await target.Transfer.ImportJsonAsync(document.ToJsonString());

        Assert.Empty(result.Issues);
        var importedProject = Assert.Single(await target.ReadProjectsAsync());
        var imported = Assert.Single(await target.ReadItemsAsync(importedProject.Id));
        Assert.Equal(BuiltInLookups.CompletedId, imported.StatusId);
        Assert.Equal("completed:true", Assert.Single(await target.ReadSavedSearchesAsync()).QueryText);
    }

    [Fact]
    public async Task Csv_status_that_disagrees_with_completion_is_reported()
    {
        await using var world = await TransferWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Release");
        const string csv = "Title,Status,Completed\r\nOpen but done,Testing,yes\r\nDone but open,Completed,no\r\n";

        var result = await world.Transfer.ImportCsvAsync(csv, project.Id, null);

        Assert.Equal(["Row 2, Status", "Row 3, Status"], result.Issues.Select(issue => issue.Path));
        Assert.Empty(await world.ReadItemsAsync(project.Id));
    }

    [Fact]
    public async Task Csv_round_trips_status_names_and_completes_a_Done_row()
    {
        await using var world = await TransferWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Release");

        var result = await world.Transfer.ImportCsvAsync("Title,Status\r\nTest,Testing\r\nShip,Completed\r\n", project.Id, null);

        Assert.Empty(result.Issues);
        var rows = await world.ReadItemsAsync(project.Id);
        Assert.Null(rows[0].CompletedAtUtc);
        Assert.NotNull(rows[0].StatusId);
        Assert.NotNull(rows[1].CompletedAtUtc);
        Assert.Equal(BuiltInLookups.CompletedId, rows[1].StatusId);
        var csv = await world.Transfer.ExportProjectCsvAsync(project.Id);
        Assert.Contains(",Testing,", csv);
        Assert.Contains(",Completed,", csv);
    }

    private static async Task<StatusLevel> FindStatusAsync(TransferWorld world, string name)
    {
        return (await world.Lookups.StatusesAsync()).Single(status => status.Name == name);
    }

    /// <summary>Turns a current export into one written before statuses existed.</summary>
    private static void RemoveStatuses(JsonObject document)
    {
        document.Remove("statuses");
        foreach (var item in document["projects"]!.AsArray().SelectMany(project => project!["items"]!.AsArray()))
        {
            item!.AsObject().Remove("statusId");
            item.AsObject().Remove("reopenStatusId");
        }

        var search = document["savedSearches"]![0]!;
        search["queryText"] = "status:true";
    }
}