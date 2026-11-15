#pragma warning disable xUnit1051
using System.Text.Json.Nodes;

using TaskTracker.Core;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Settings;
using TaskTracker.Core.Transfer;

namespace TaskTracker.Infrastructure.Tests.Transfer;

public sealed class JsonExportTests
{
    [Fact]
    public async Task Export_writes_the_format_version_and_scope()
    {
        await using var world = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(world);

        var document = TransferJson.Parse(await world.Transfer.ExportJsonAsync(new TransferScope.AllData()));

        Assert.Equal("task-tracker", document["format"]!.GetValue<string>());
        Assert.Equal(1, document["version"]!.GetValue<int>());
        Assert.Equal("all", document["scope"]!.GetValue<string>());
        var exportTime = TransferTimeFormat.FormatUtc(world.Store.Clock.GetUtcNow().UtcDateTime);
        Assert.Equal(exportTime, document["exportedAtUtc"]!.GetValue<string>());
    }

    [Fact]
    public async Task Export_leaves_out_soft_deleted_projects_folders_and_items()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);
        await world.Folders.DeleteAsync(ids.BillingId, (await world.Folders.CreateAsync(ids.BillingId, null, "Scratch")).Id);

        var document = TransferJson.Parse(await world.Transfer.ExportJsonAsync(new TransferScope.AllData()));

        var names = document["projects"]!.AsArray().Select(project => project!["name"]!.GetValue<string>());
        Assert.Equal(["Billing", "Home Lab"], names);
        var billing = TransferJson.Project(document, "Billing");
        var titles = billing["items"]!.AsArray().Select(item => item!["title"]!.GetValue<string>()).ToList();
        Assert.DoesNotContain("Old idea", titles);
        Assert.Equal(4, titles.Count);
        var folders = billing["folders"]!.AsArray().Select(folder => folder!["name"]!.GetValue<string>());
        Assert.DoesNotContain("Scratch", folders);
        Assert.Equal(3, folders.Count());
    }

    [Fact]
    public async Task Export_writes_item_type_and_priority_by_name_and_id()
    {
        await using var world = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(world);

        var document = TransferJson.Parse(await world.Transfer.ExportJsonAsync(new TransferScope.AllData()));

        var item = TransferJson.Item(document, "Fix invoice totals");
        Assert.Equal("Change", item["itemType"]!.GetValue<string>());
        Assert.Equal(BuiltInLookups.ChangeId, item["itemTypeId"]!.GetValue<Guid>());
        Assert.Equal("High", item["priority"]!.GetValue<string>());
        Assert.Equal(BuiltInLookups.HighId, item["priorityLevelId"]!.GetValue<Guid>());
    }

    [Fact]
    public async Task Export_writes_floating_times_without_offset_and_utc_times_with_z()
    {
        await using var world = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(world);

        var document = TransferJson.Parse(await world.Transfer.ExportJsonAsync(new TransferScope.AllData()));

        var fix = TransferJson.Item(document, "Fix invoice totals");
        Assert.Equal("2026-11-20", fix["dueDate"]!.GetValue<string>());
        Assert.Equal("15:00:00", fix["dueTime"]!.GetValue<string>());
        var addIndex = TransferJson.Item(document, "Add index");
        Assert.Equal("2026-11-21T09:00:00", addIndex["scheduledStart"]!.GetValue<string>());
        Assert.Equal("2026-11-21T10:30:00", addIndex["scheduledEnd"]!.GetValue<string>());
        Assert.EndsWith("Z", addIndex["completedAtUtc"]!.GetValue<string>());
        Assert.EndsWith("Z", addIndex["createdAtUtc"]!.GetValue<string>());
        Assert.Null(fix["completedAtUtc"]);
    }

    [Fact]
    public async Task Export_writes_custom_values_by_field_key_with_choice_label_and_id()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);

        var document = TransferJson.Parse(await world.Transfer.ExportJsonAsync(new TransferScope.AllData()));

        var values = TransferJson.Item(document, "Fix invoice totals")["fieldValues"]!.AsArray()
            .ToDictionary(value => value!["fieldKey"]!.GetValue<string>(), value => value!.AsObject());
        Assert.Equal("Major", values["severity"]["choiceLabel"]!.GetValue<string>());
        Assert.Equal(ids.MajorChoiceId, values["severity"]["choiceId"]!.GetValue<Guid>());
        Assert.Equal(2.5, values["estimate"]["number"]!.GetValue<double>());
        Assert.Equal("2026-11-01", values["reviewed"]["date"]!.GetValue<string>());
        Assert.True(values["flag"]["boolean"]!.GetValue<bool>());
        Assert.Equal("Acme, Inc.", values["customer"]["text"]!.GetValue<string>());
    }

    [Fact]
    public async Task Export_includes_archived_lookups_fields_and_choices_in_order()
    {
        await using var world = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(world);

        var document = TransferJson.Parse(await world.Transfer.ExportJsonAsync(new TransferScope.AllData()));

        var priorities = document["priorityLevels"]!.AsArray().Select(level => level!["name"]!.GetValue<string>());
        Assert.Equal(["Critical", "High", "Medium", "Low", "Urgent", "Someday"], priorities);
        var someday = document["priorityLevels"]!.AsArray().Single(level => level!["name"]!.GetValue<string>() == "Someday");
        Assert.True(someday!["isArchived"]!.GetValue<bool>());
        var fields = document["fields"]!.AsArray().Select(field => field!["key"]!.GetValue<string>());
        Assert.Contains("old-note", fields);
        Assert.Contains("customer", fields);
        var severity = document["fields"]!.AsArray().Single(field => field!["key"]!.GetValue<string>() == "severity")!;
        var legacy = severity["choices"]!.AsArray().Single(choice => choice!["label"]!.GetValue<string>() == "Legacy");
        Assert.True(legacy!["isArchived"]!.GetValue<bool>());
    }

    [Fact]
    public async Task Export_writes_project_overrides_global_settings_and_saved_searches()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);
        await world.Settings.SetGlobalAsync(SettingsCatalogue.UrgencyYellowThreshold, TimeSpan.FromDays(4));

        var document = TransferJson.Parse(await world.Transfer.ExportJsonAsync(new TransferScope.AllData()));

        var settings = TransferJson.Project(document, "Billing")["settings"]!.AsObject();
        Assert.Equal("P5D", settings["urgencyYellowThreshold"]!.GetValue<string>());
        Assert.Equal("P4D", document["globalSettings"]!["urgencyYellowThreshold"]!.GetValue<string>());
        var searches = document["savedSearches"]!.AsArray();
        Assert.Equal(["Open major", "Spikes"], searches.Select(search => search!["name"]!.GetValue<string>()));
        Assert.Equal($"severity:#{ids.MajorChoiceId}", searches[0]!["queryText"]!.GetValue<string>());
        Assert.Equal("Project", searches[0]!["scopeKind"]!.GetValue<string>());
    }

    [Fact]
    public async Task A_single_project_export_holds_only_that_project_and_what_it_references()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);

        var document = TransferJson.Parse(
            await world.Transfer.ExportJsonAsync(new TransferScope.SingleProject(ids.HomeLabId)));

        Assert.Equal("project", document["scope"]!.GetValue<string>());
        Assert.Equal(["Home Lab"], document["projects"]!.AsArray().Select(project => project!["name"]!.GetValue<string>()));
        Assert.Empty(document["itemTypes"]!.AsArray());
        Assert.Empty(document["fields"]!.AsArray());
        Assert.Empty(document["savedSearches"]!.AsArray());
        Assert.Null(document["globalSettings"]);
    }

    [Fact]
    public async Task A_single_project_export_includes_the_global_lookups_and_fields_its_items_use()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);

        var document = TransferJson.Parse(
            await world.Transfer.ExportJsonAsync(new TransferScope.SingleProject(ids.BillingId)));

        var types = document["itemTypes"]!.AsArray().Select(type => type!["name"]!.GetValue<string>());
        Assert.Equal(["Change", "Spike"], types);
        var keys = document["fields"]!.AsArray().Select(field => field!["key"]!.GetValue<string>()).Order();
        Assert.Equal(["customer", "estimate", "flag", "notes", "reviewed", "severity"], keys);
        var searches = document["savedSearches"]!.AsArray().Select(search => search!["name"]!.GetValue<string>());
        Assert.Equal(["Open major"], searches);
    }

    [Fact]
    public async Task Exporting_a_deleted_project_is_refused()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);

        var refused = await Assert.ThrowsAsync<DomainRuleException>(() =>
            world.Transfer.ExportJsonAsync(new TransferScope.SingleProject(ids.TrashedProjectId)));

        Assert.Equal("Project is missing or deleted.", refused.Message);
    }

    [Fact]
    public async Task Exporting_twice_gives_identical_text()
    {
        await using var world = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(world);

        var first = await world.Transfer.ExportJsonAsync(new TransferScope.AllData());
        var second = await world.Transfer.ExportJsonAsync(new TransferScope.AllData());

        Assert.Equal(first, second);
    }

    [Fact]
    public async Task Export_text_does_not_depend_on_the_current_culture()
    {
        await using var world = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(world);
        var english = await world.Transfer.ExportJsonAsync(new TransferScope.AllData());

        using var german = TransferCulture.Use("de-DE");
        var germanText = await world.Transfer.ExportJsonAsync(new TransferScope.AllData());

        Assert.Equal(english, germanText);
        Assert.Contains("2.5", germanText);
    }

    [Fact]
    public async Task Export_keeps_readable_unicode_instead_of_escapes()
    {
        await using var world = await TransferWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Café Überblick");

        var json = await world.Transfer.ExportJsonAsync(new TransferScope.SingleProject(project.Id));

        Assert.Contains("Café Überblick", json);
        Assert.IsType<JsonObject>(TransferJson.Parse(json));
    }
}