#pragma warning disable xUnit1051
using System.Text.Json.Nodes;

using TaskTracker.Core.Transfer;
using TaskTracker.Infrastructure.Tests.Persistence;

namespace TaskTracker.Infrastructure.Tests.Transfer;

public sealed class JsonImportValidationTests
{
    [Fact]
    public async Task A_file_with_another_format_is_rejected()
    {
        var issue = await RejectedIssueAsync(document => document["format"] = "something-else");

        Assert.Equal("$.format", issue.Path);
    }

    [Fact]
    public async Task A_newer_version_is_rejected_with_a_message_to_update()
    {
        var issue = await RejectedIssueAsync(document => document["version"] = 2);

        Assert.Equal("$.version", issue.Path);
        Assert.Contains("newer version", issue.Message);
    }

    [Fact]
    public async Task An_older_or_missing_version_is_rejected()
    {
        var older = await RejectedIssueAsync(document => document["version"] = 0);
        var missing = await RejectedIssueAsync(document => document.Remove("version"));

        Assert.Equal("$.version", older.Path);
        Assert.Equal("$.version", missing.Path);
    }

    [Fact]
    public async Task Text_that_is_not_json_is_rejected_and_changes_nothing()
    {
        await using var world = await TransferWorld.CreateAsync();
        var before = await world.CountRowsAsync();

        var result = await world.Transfer.ImportJsonAsync("{ this is not json");

        Assert.False(result.Succeeded);
        Assert.Equal("$", Assert.Single(result.Issues).Path);
        Assert.Equal(before, await world.CountRowsAsync());
        Assert.Equal(0, world.Backup.Count);
    }

    [Fact]
    public async Task A_value_of_the_wrong_json_type_is_reported_with_its_path()
    {
        var issue = await RejectedIssueAsync(document =>
            TransferJson.Project(document, "Billing")["sortOrder"] = "first");

        Assert.Equal("$.projects[0].sortOrder", issue.Path);
    }

    [Fact]
    public async Task A_missing_project_name_is_reported_with_its_path()
    {
        var issue = await RejectedIssueAsync(document => TransferJson.Project(document, "Billing").Remove("name"));

        Assert.Equal("$.projects[0].name", issue.Path);
    }

    [Fact]
    public async Task Item_problems_are_reported_with_the_index_of_the_item()
    {
        var json = await ExportSeedAsync();
        var index = TransferJson.ItemIndex(TransferJson.Parse(json), "Billing", "Add index");

        var issues = await RejectedIssuesAsync(json, document =>
        {
            var item = TransferJson.Item(document, "Add index");
            item["title"] = "   ";
            item["dueDate"] = "20/11/2026";
            item["scheduledEnd"] = "2026-11-21T08:00:00";
        });

        var prefix = $"$.projects[0].items[{index}]";
        Assert.Contains(issues, issue => issue.Path == $"{prefix}.title");
        Assert.Contains(issues, issue => issue.Path == $"{prefix}.dueDate");
        Assert.Contains(issues, issue => issue.Path == $"{prefix}.scheduledEnd");
    }

    [Fact]
    public async Task All_problems_are_reported_together()
    {
        var issues = await RejectedIssuesAsync(await ExportSeedAsync(), document =>
        {
            TransferJson.Project(document, "Billing")["name"] = "";
            TransferJson.Item(document, "Replace router")["dueTime"] = "15:00:00";
            TransferJson.Project(document, "Home Lab")["folders"] = new JsonArray(new JsonObject { ["name"] = "No id" });
        });

        Assert.True(issues.Count >= 3, string.Join("; ", issues));
    }

    [Fact]
    public async Task A_due_time_without_a_due_date_is_rejected()
    {
        var issue = await RejectedIssueAsync(document => TransferJson.Item(document, "Replace router")["dueTime"] = "15:00:00");

        Assert.EndsWith(".dueTime", issue.Path);
    }

    [Fact]
    public async Task A_floating_time_with_a_z_or_offset_is_rejected()
    {
        var withZ = await RejectedIssueAsync(document =>
            TransferJson.Item(document, "Add index")["scheduledStart"] = "2026-11-21T09:00:00Z");
        var withOffset = await RejectedIssueAsync(document =>
            TransferJson.Item(document, "Add index")["scheduledStart"] = "2026-11-21T09:00:00+02:00");

        Assert.EndsWith(".scheduledStart", withZ.Path);
        Assert.EndsWith(".scheduledStart", withOffset.Path);
    }

    [Fact]
    public async Task A_completion_time_without_z_is_rejected()
    {
        var issue = await RejectedIssueAsync(document =>
            TransferJson.Item(document, "Add index")["completedAtUtc"] = "2026-11-21T09:00:00");

        Assert.EndsWith(".completedAtUtc", issue.Path);
    }

    [Fact]
    public async Task A_sub_item_in_another_folder_than_its_parent_is_rejected()
    {
        var issue = await RejectedIssueAsync(document =>
        {
            var folders = TransferJson.Project(document, "Billing")["folders"]!.AsArray();
            TransferJson.Item(document, "Check query plan")["folderId"] = folders[0]!["id"]!.GetValue<Guid>();
        });

        Assert.EndsWith(".folderId", issue.Path);
        Assert.Contains("same folder", issue.Message);
    }

    [Fact]
    public async Task An_item_in_a_folder_of_another_project_is_rejected()
    {
        var issue = await RejectedIssueAsync(document =>
        {
            var folder = TransferJson.Project(document, "Billing")["folders"]![0]!["id"]!.GetValue<Guid>();
            TransferJson.Item(document, "Replace router")["folderId"] = folder;
        });

        Assert.EndsWith(".folderId", issue.Path);
    }

    [Fact]
    public async Task Items_that_would_be_each_others_parent_are_rejected()
    {
        var issues = await RejectedIssuesAsync(await ExportSeedAsync(), document =>
        {
            var parent = TransferJson.Item(document, "Fix invoice totals");
            var child = TransferJson.Item(document, "Check query plan");
            parent["parentItemId"] = child["id"]!.GetValue<Guid>();
        });

        Assert.Contains(issues, issue => issue.Message.Contains("sub-item of itself"));
    }

    [Fact]
    public async Task Folders_that_would_be_inside_each_other_are_rejected()
    {
        var issues = await RejectedIssuesAsync(await ExportSeedAsync(), document =>
        {
            var folders = TransferJson.Project(document, "Billing")["folders"]!.AsArray();
            var dbo = folders.Single(folder => folder!["name"]!.GetValue<string>() == "dbo")!;
            var tables = folders.Single(folder => folder!["name"]!.GetValue<string>() == "Tables")!;
            dbo["parentFolderId"] = tables["id"]!.GetValue<Guid>();
        });

        Assert.Contains(issues, issue => issue.Message.Contains("inside itself"));
    }

    [Fact]
    public async Task An_unknown_item_type_or_priority_is_rejected()
    {
        var issues = await RejectedIssuesAsync(await ExportSeedAsync(), document =>
        {
            var item = TransferJson.Item(document, "Fix invoice totals");
            item["itemTypeId"] = Guid.NewGuid();
            item["priorityLevelId"] = Guid.NewGuid();
        });

        Assert.Contains(issues, issue => issue.Path.EndsWith(".itemType"));
        Assert.Contains(issues, issue => issue.Path.EndsWith(".priority"));
    }

    [Fact]
    public async Task Duplicate_ids_are_rejected()
    {
        var issue = await RejectedIssueAsync(document =>
            TransferJson.Item(document, "Replace router")["id"] = TransferJson.Item(document, "Fix invoice totals")["id"]!.GetValue<Guid>());

        Assert.EndsWith(".id", issue.Path);
        Assert.Contains("more than once", issue.Message);
    }

    [Fact]
    public async Task A_value_for_a_field_the_file_does_not_define_is_rejected()
    {
        var issue = await RejectedIssueAsync(document =>
            FieldValues(document, "Fix invoice totals").Add(new JsonObject { ["fieldKey"] = "missing", ["text"] = "x" }));

        Assert.EndsWith(".fieldKey", issue.Path);
        Assert.Contains("missing", issue.Message);
    }

    [Fact]
    public async Task A_value_whose_type_does_not_match_the_field_is_rejected()
    {
        var issue = await RejectedIssueAsync(document =>
        {
            var estimate = FieldValues(document, "Fix invoice totals").Single(value => value!["fieldKey"]!.GetValue<string>() == "estimate")!;
            estimate.AsObject().Remove("number");
            estimate["text"] = "two and a half";
        });

        Assert.Contains("field type Number", issue.Message);
    }

    [Fact]
    public async Task A_choice_that_is_not_an_option_of_the_field_is_rejected()
    {
        var issue = await RejectedIssueAsync(document =>
        {
            var severity = FieldValues(document, "Fix invoice totals").Single(value => value!["fieldKey"]!.GetValue<string>() == "severity")!;
            severity.AsObject().Remove("choiceId");
            severity["choiceLabel"] = "Catastrophic";
        });

        Assert.Contains("not one of the options", issue.Message);
    }

    [Fact]
    public async Task A_value_with_two_typed_values_or_none_is_rejected()
    {
        var both = await RejectedIssueAsync(document =>
            FieldValues(document, "Fix invoice totals").Single(value => value!["fieldKey"]!.GetValue<string>() == "estimate")!["text"] = "x");
        var none = await RejectedIssueAsync(document =>
            FieldValues(document, "Fix invoice totals").Single(value => value!["fieldKey"]!.GetValue<string>() == "estimate")!.AsObject().Remove("number"));

        Assert.Equal("Exactly one value is required.", both.Message);
        Assert.Equal("Exactly one value is required.", none.Message);
    }

    [Fact]
    public async Task A_second_value_for_the_same_field_on_one_item_is_rejected()
    {
        var issue = await RejectedIssueAsync(document =>
            FieldValues(document, "Fix invoice totals").Add(new JsonObject { ["fieldKey"] = "estimate", ["number"] = 3 }));

        Assert.Contains("more than one value", issue.Message);
    }

    [Fact]
    public async Task A_project_field_value_on_an_item_of_another_project_is_rejected()
    {
        var issue = await RejectedIssueAsync(document =>
            FieldValues(document, "Replace router").Add(new JsonObject { ["fieldKey"] = "customer", ["text"] = "x" }));

        Assert.Contains("another project", issue.Message);
    }

    [Fact]
    public async Task Blank_text_and_a_malformed_date_value_are_rejected()
    {
        var blank = await RejectedIssueAsync(document =>
            FieldValues(document, "Fix invoice totals").Single(value => value!["fieldKey"]!.GetValue<string>() == "notes")!["text"] = "   ");
        var date = await RejectedIssueAsync(document =>
            FieldValues(document, "Fix invoice totals").Single(value => value!["fieldKey"]!.GetValue<string>() == "reviewed")!["date"] = "11/01/2026");

        Assert.EndsWith(".text", blank.Path);
        Assert.EndsWith(".date", date.Path);
    }

    [Fact]
    public async Task A_saved_search_pointing_at_a_project_outside_the_file_is_rejected()
    {
        var issue = await RejectedIssueAsync(document =>
            document["savedSearches"]![0]!["projectId"] = Guid.NewGuid());

        Assert.EndsWith(".projectId", issue.Path);
    }

    [Fact]
    public async Task An_unreadable_setting_value_is_rejected_and_unknown_settings_are_ignored()
    {
        var bad = await RejectedIssueAsync(document =>
            TransferJson.Project(document, "Billing")["settings"]!["urgencyYellowThreshold"] = "soon");

        Assert.EndsWith(".settings.urgencyYellowThreshold", bad.Path);

        await using var world = await TransferWorld.CreateAsync();
        var json = TransferJson.Edit(await ExportSeedAsync(), document =>
            TransferJson.Project(document, "Billing")["settings"]!["futureSetting"] = "whatever");
        Assert.True((await world.Transfer.ImportJsonAsync(json)).Succeeded);
    }

    [Fact]
    public async Task Duplicate_item_type_names_and_active_choice_labels_are_rejected()
    {
        var types = await RejectedIssuesAsync(await ExportSeedAsync(), document =>
            document["itemTypes"]!.AsArray()[3]!["name"] = "change");
        var labels = await RejectedIssuesAsync(await ExportSeedAsync(), document =>
        {
            var severity = document["fields"]!.AsArray().Single(field => field!["key"]!.GetValue<string>() == "severity")!;
            severity["choices"]!.AsArray()[1]!["label"] = "minor";
        });

        Assert.Contains(types, issue => issue.Path == "$.itemTypes[3].name");
        Assert.Contains(labels, issue => issue.Message.Contains("more than one active choice"));
    }

    [Fact]
    public async Task A_rejected_file_never_takes_a_backup_or_adds_rows()
    {
        await using var world = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(world);
        var json = TransferJson.Edit(await world.Transfer.ExportJsonAsync(new TransferScope.AllData()), document =>
            TransferJson.Item(document, "Replace router")["dueDate"] = "nonsense");
        var before = await world.CountRowsAsync();

        var result = await world.Transfer.ImportJsonAsync(json);

        Assert.False(result.Succeeded);
        Assert.Equal(before, await world.CountRowsAsync());
        Assert.Equal(0, world.Backup.Count);
        Assert.Equal(TransferSummary.Empty, result.Summary);
    }

    [Fact]
    public async Task A_successful_import_is_not_recorded_as_an_undo_step()
    {
        await using var world = await UndoWorld.CreateAsync();
        var seeded = await world.Projects.CreateAsync("Existing");
        var json = await world.Transfer.ExportJsonAsync(new TransferScope.SingleProject(seeded.Id));
        var steps = world.Recorder.Descriptions.Count;

        var result = await world.Transfer.ImportJsonAsync(json);

        Assert.True(result.Succeeded);
        Assert.Equal(steps, world.Recorder.Descriptions.Count);
        Assert.Equal("Create 'Existing'", world.History.UndoDescription);
    }

    private static async Task<string> ExportSeedAsync()
    {
        await using var world = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(world);

        return await world.Transfer.ExportJsonAsync(new TransferScope.AllData());
    }

    private static JsonArray FieldValues(JsonObject document, string itemTitle)
    {
        return TransferJson.Item(document, itemTitle)["fieldValues"]!.AsArray();
    }

    private static async Task<TransferIssue> RejectedIssueAsync(Action<JsonObject> edit)
    {
        var issues = await RejectedIssuesAsync(await ExportSeedAsync(), edit);

        return issues[0];
    }

    /// <summary>Imports the edited file into a database holding other data and checks that nothing changed.</summary>
    private static async Task<IReadOnlyList<TransferIssue>> RejectedIssuesAsync(string json, Action<JsonObject> edit)
    {
        await using var world = await TransferWorld.CreateAsync();
        await world.Projects.CreateAsync("Already here");
        var before = await world.CountRowsAsync();

        var result = await world.Transfer.ImportJsonAsync(TransferJson.Edit(json, edit));

        Assert.False(result.Succeeded, "The edited file was accepted.");
        Assert.NotEmpty(result.Issues);
        Assert.Equal(before, await world.CountRowsAsync());
        Assert.Equal(0, world.Backup.Count);

        return result.Issues;
    }
}