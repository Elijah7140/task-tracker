#pragma warning disable xUnit1051
using System.Text.Json.Nodes;

using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
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

    [Fact]
    public async Task Legacy_global_field_renaming_keeps_incoming_suffixes_and_values_distinct()
    {
        await using var source = await TransferWorld.CreateAsync();
        await using var target = await TransferWorld.CreateAsync();
        var project = await source.Projects.CreateAsync("Release");
        var item = await source.Items.CreateAsync(project.Id, null, null, "Review");
        var legacy = await source.Fields.CreateAsync("Legacy", FieldDataType.Text, null);
        var second = await source.Fields.CreateAsync("Completed 2", FieldDataType.Text, null);
        await source.Items.EditAsync(item.Id, new ItemEdit(item.Title, null, null, null, null, null, null, null, null),
            [new(legacy.Id, TextValue: "Legacy value"), new(second.Id, TextValue: "Other value")]);
        var document = JsonNode.Parse(await source.Transfer.ExportJsonAsync(new TransferScope.AllData()))!.AsObject();
        document.Remove("statuses");
        document["fields"]![0]!["key"] = "completed";
        var values = document["projects"]![0]!["items"]![0]!["fieldValues"]!.AsArray();
        values.Single(value => (string?)value!["fieldKey"] == legacy.Key)!["fieldKey"] = "completed";

        var result = await target.Transfer.ImportJsonAsync(document.ToJsonString());

        Assert.Empty(result.Issues);
        var fields = (await target.ReadFieldsAsync()).ToDictionary(field => field.Id);
        var imported = Assert.Single(await target.ReadItemsAsync(Assert.Single(await target.ReadProjectsAsync()).Id));
        var importedValues = (await target.ReadValuesAsync(imported.Id))
            .ToDictionary(value => fields[value.FieldDefinitionId].Key, value => value.TextValue);
        Assert.Equal("Legacy value", importedValues["completed-3"]);
        Assert.Equal("Other value", importedValues["completed-2"]);
    }

    [Fact]
    public async Task Csv_round_trips_both_a_numbered_priority_and_a_priority_named_for_that_number()
    {
        await using var world = await TransferWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Release");
        var named = await world.Lookups.AddPriorityLevelAsync("7");
        var numbered = await world.Lookups.AddPriorityLevelAsync(string.Empty, 7);
        var first = await world.Items.CreateAsync(project.Id, null, null, "Numbered");
        var second = await world.Items.CreateAsync(project.Id, null, null, "Named");
        await world.Items.SetPriorityAsync(first.Id, numbered.Id);
        await world.Items.SetPriorityAsync(second.Id, named.Id);
        var csv = await world.Transfer.ExportProjectCsvAsync(project.Id);
        var destination = await world.Projects.CreateAsync("Imported");

        var result = await world.Transfer.ImportCsvAsync(csv, destination.Id, null);

        Assert.Empty(result.Issues);
        var rows = (await world.ReadItemsAsync(destination.Id)).ToDictionary(row => row.Title);
        Assert.Contains(",7,#7,", csv);
        Assert.Contains(",7,#name:7,", csv);
        Assert.Equal(numbered.Id, rows["Numbered"].PriorityLevelId);
        Assert.Equal(named.Id, rows["Named"].PriorityLevelId);
    }

    [Fact]
    public async Task Csv_reports_ambiguous_legacy_priority_labels()
    {
        await using var world = await TransferWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Release");
        await world.Lookups.AddPriorityLevelAsync("7");
        await world.Lookups.AddPriorityLevelAsync(string.Empty, 7);

        var result = await world.Transfer.ImportCsvAsync("Title,Priority\r\nReview,7\r\n", project.Id, null);

        var issue = Assert.Single(result.Issues);
        Assert.Equal("Row 2, Priority", issue.Path);
        Assert.Empty(await world.ReadItemsAsync(project.Id));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Json_keeps_archived_number_only_priorities_distinct(bool reimport)
    {
        await using var source = await TransferWorld.CreateAsync();
        await using var other = await TransferWorld.CreateAsync();
        var target = reimport ? source : other;
        var project = await source.Projects.CreateAsync("Release");
        var first = await AddArchivedPriorityAsync(source, project.Id, "First");
        var second = await AddArchivedPriorityAsync(source, project.Id, "Second");
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.AllData());

        for (var attempt = 0; attempt < 2; attempt++)
        {
            var result = await target.Transfer.ImportJsonAsync(json);

            Assert.Empty(result.Issues);
            var imported = (await target.ReadProjectsAsync())[^1];
            var items = (await target.ReadItemsAsync(imported.Id)).ToDictionary(item => item.Title);
            var archived = (await target.Lookups.PriorityLevelsAsync()).Where(level => level.IsArchived).ToArray();
            Assert.Equal(2, archived.Length);
            Assert.Equal(archived[0].Id, items["First"].PriorityLevelId);
            Assert.Equal(archived[1].Id, items["Second"].PriorityLevelId);
            if (reimport)
            {
                Assert.Equal(first.Id, items["First"].PriorityLevelId);
                Assert.Equal(second.Id, items["Second"].PriorityLevelId);
            }
        }
    }

    private static async Task<PriorityLevel> AddArchivedPriorityAsync(TransferWorld world, Guid projectId, string title)
    {
        var priority = await world.Lookups.AddPriorityLevelAsync(string.Empty, 7);
        var item = await world.Items.CreateAsync(projectId, null, null, title);
        await world.Items.SetPriorityAsync(item.Id, priority.Id);
        await world.Lookups.ArchivePriorityLevelAsync(priority.Id);
        return priority;
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