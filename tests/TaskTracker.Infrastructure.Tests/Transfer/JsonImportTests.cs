#pragma warning disable xUnit1051
using TaskTracker.Core.Fields;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Settings;
using TaskTracker.Core.Transfer;

namespace TaskTracker.Infrastructure.Tests.Transfer;

public sealed class JsonImportTests
{
    [Fact]
    public async Task Importing_into_the_same_database_adds_new_projects_and_never_touches_existing_rows()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);
        var json = await world.Transfer.ExportJsonAsync(new TransferScope.AllData());
        var before = await world.CountRowsAsync();
        var originalItems = await world.ReadItemsAsync(ids.BillingId);

        var result = await world.Transfer.ImportJsonAsync(json);

        Assert.True(result.Succeeded);
        var after = await world.CountRowsAsync();
        Assert.Equal(before.Projects + 2, after.Projects);
        Assert.Equal(before.Items + 5, after.Items);
        Assert.Equal(before.ItemTypes, after.ItemTypes);
        Assert.Equal(before.Fields + 1, after.Fields);
        Assert.Equal(originalItems.Select(item => item.UpdatedAtUtc), (await world.ReadItemsAsync(ids.BillingId)).Select(item => item.UpdatedAtUtc));
        Assert.Equal(new TransferSummary(2, 3, 5, 2), result.Summary);
    }

    [Fact]
    public async Task A_project_name_that_exists_gets_an_imported_suffix_that_counts_up()
    {
        await using var world = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(world);
        var json = await world.Transfer.ExportJsonAsync(new TransferScope.AllData());

        await world.Transfer.ImportJsonAsync(json);
        await world.Transfer.ImportJsonAsync(json);

        var names = (await world.ReadProjectsAsync()).Select(project => project.Name);
        Assert.Equal(
            ["Billing", "Home Lab", "Billing (imported)", "Home Lab (imported)", "Billing (imported 2)", "Home Lab (imported 2)"],
            names);
    }

    [Fact]
    public async Task Imported_projects_are_ordered_after_the_existing_ones()
    {
        await using var world = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(world);
        var json = await world.Transfer.ExportJsonAsync(new TransferScope.AllData());

        await world.Transfer.ImportJsonAsync(json);

        var orders = (await world.ReadProjectsAsync()).Select(project => project.SortOrder).ToList();
        Assert.Equal(orders.Order(), orders);
        Assert.Equal(4, orders.Distinct().Count());
    }

    [Fact]
    public async Task Lookups_and_global_fields_are_matched_by_name_and_key_ignoring_case()
    {
        await using var source = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(source);
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.AllData());
        await using var target = await TransferWorld.CreateAsync();
        var spike = await target.Lookups.AddItemTypeAsync("SPIKE");
        var severity = await target.Fields.CreateAsync("Severity", FieldDataType.Choice, null);
        var major = await target.Fields.AddChoiceAsync(severity.Id, "MAJOR");

        var result = await target.Transfer.ImportJsonAsync(json);

        Assert.True(result.Succeeded, string.Join("; ", result.Issues));
        Assert.Single(await target.Lookups.ItemTypesAsync(), type => string.Equals(type.Name, "spike", StringComparison.OrdinalIgnoreCase));
        var billing = (await target.ReadProjectsAsync()).Single(project => project.Name == "Billing");
        var addIndex = (await target.ReadItemsAsync(billing.Id)).Single(item => item.Title == "Add index");
        Assert.Equal(spike.Id, addIndex.ItemTypeId);
        Assert.Single(await target.ReadFieldsAsync(), field => field.Key == "severity");
        var choices = await target.ReadChoicesAsync(severity.Id);
        Assert.Equal(["MAJOR", "Minor", "Legacy"], choices.Select(choice => choice.Label));
        var fix = (await target.ReadItemsAsync(billing.Id)).Single(item => item.Title == "Fix invoice totals");
        var value = (await target.ReadValuesAsync(fix.Id)).Single(row => row.FieldDefinitionId == severity.Id);
        Assert.Equal(major.Id, value.ChoiceId);
    }

    [Fact]
    public async Task Missing_lookups_and_fields_are_created_after_the_existing_ones_keeping_archived_flags()
    {
        await using var source = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(source);
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.AllData());
        await using var target = await TransferWorld.CreateAsync();

        await target.Transfer.ImportJsonAsync(json);

        var priorities = await target.Lookups.PriorityLevelsAsync();
        Assert.Equal(["Critical", "High", "Medium", "Low", "Urgent", "Someday"], priorities.Select(level => level.Name));
        Assert.True(priorities.Single(level => level.Name == "Someday").IsArchived);
        var fields = await target.ReadFieldsAsync();
        Assert.True(fields.Single(field => field.Key == "old-note").IsArchived);
        Assert.Null(fields.Single(field => field.Key == "estimate").ProjectId);
    }

    [Fact]
    public async Task A_global_field_whose_key_exists_with_another_type_stops_the_import_and_changes_nothing()
    {
        await using var source = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(source);
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.AllData());
        await using var target = await TransferWorld.CreateAsync();
        await target.Fields.CreateAsync("Estimate", FieldDataType.Text, null);
        var before = await target.CountRowsAsync();

        var result = await target.Transfer.ImportJsonAsync(json);

        Assert.False(result.Succeeded);
        var issue = Assert.Single(result.Issues);
        Assert.Matches(@"^\$\.fields\[\d+\]\.dataType$", issue.Path);
        Assert.Contains("estimate", issue.Message);
        Assert.Equal(before, await target.CountRowsAsync());
        Assert.Equal(0, target.Backup.Count);
    }

    [Fact]
    public async Task A_project_field_whose_key_or_name_is_taken_gets_a_numbered_key_and_an_imported_name()
    {
        await using var source = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(source);
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.AllData());
        await using var target = await TransferWorld.CreateAsync();
        await target.Fields.CreateAsync("Customer", FieldDataType.Text, null);

        var result = await target.Transfer.ImportJsonAsync(json);

        Assert.True(result.Succeeded, string.Join("; ", result.Issues));
        var billing = (await target.ReadProjectsAsync()).Single(project => project.Name == "Billing");
        var projectField = Assert.Single(await target.ReadFieldsAsync(), field => field.ProjectId == billing.Id);
        Assert.Equal("customer-2", projectField.Key);
        Assert.Equal("Customer (imported)", projectField.DisplayName);
        var fix = (await target.ReadItemsAsync(billing.Id)).Single(item => item.Title == "Fix invoice totals");
        var values = await target.ReadValuesAsync(fix.Id);
        Assert.Equal("Acme, Inc.", values.Single(value => value.FieldDefinitionId == projectField.Id).TextValue);
    }

    [Fact]
    public async Task Project_overrides_are_imported_but_global_settings_are_not()
    {
        await using var source = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(source);
        await source.Settings.SetGlobalAsync(SettingsCatalogue.UrgencyYellowThreshold, TimeSpan.FromDays(10));
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.AllData());
        await using var target = await TransferWorld.CreateAsync();

        await target.Transfer.ImportJsonAsync(json);

        var billing = (await target.ReadProjectsAsync()).Single(project => project.Name == "Billing");
        var effective = await target.ReadEffectiveSettingsAsync(billing.Id);
        Assert.Equal(TimeSpan.FromDays(5), effective.UrgencyYellowThreshold.Value);
        Assert.Equal(SettingSource.Project, effective.UrgencyYellowThreshold.Source);
        var global = await target.Settings.GetGlobalAsync(SettingsCatalogue.UrgencyYellowThreshold);
        Assert.Equal(TimeSpan.FromDays(3), global);
    }

    [Fact]
    public async Task Overrides_that_would_be_invalid_against_this_databases_global_settings_stop_the_import()
    {
        await using var source = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(source);
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.AllData());
        await using var target = await TransferWorld.CreateAsync();
        await target.Settings.SaveGlobalAsync(true, TimeSpan.FromDays(9), TimeSpan.FromDays(8));
        var before = await target.CountRowsAsync();

        var result = await target.Transfer.ImportJsonAsync(json);

        Assert.False(result.Succeeded);
        Assert.Matches(@"^\$\.projects\[\d+\]\.settings$", Assert.Single(result.Issues).Path);
        Assert.Equal(before, await target.CountRowsAsync());
    }

    [Fact]
    public async Task Saved_searches_are_imported_as_new_ones_pointing_at_the_new_ids()
    {
        await using var source = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(source);
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.AllData());
        await using var target = await TransferWorld.CreateAsync();

        await target.Transfer.ImportJsonAsync(json);

        var billing = (await target.ReadProjectsAsync()).Single(project => project.Name == "Billing");
        var fields = (await target.ReadFieldsAsync()).Single(field => field.Key == "severity");
        var major = (await target.ReadChoicesAsync(fields.Id)).Single(choice => choice.Label == "Major");
        var searches = await target.ReadSavedSearchesAsync();
        var openMajor = searches.Single(search => search.Name == "Open major");
        Assert.Equal($"severity:#{major.Id}", openMajor.QueryText);
        Assert.Equal(billing.Id, openMajor.ProjectId);
        var spikes = searches.Single(search => search.Name == "Spikes");
        var spike = (await target.Lookups.ItemTypesAsync()).Single(type => type.Name == "Spike");
        Assert.Equal($"type:#{spike.Id}", spikes.QueryText);
    }

    [Fact]
    public async Task A_saved_search_name_that_exists_gets_an_imported_suffix()
    {
        await using var world = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(world);
        var json = await world.Transfer.ExportJsonAsync(new TransferScope.AllData());

        await world.Transfer.ImportJsonAsync(json);

        var names = (await world.ReadSavedSearchesAsync()).Select(search => search.Name).Order(StringComparer.Ordinal);
        Assert.Equal(["Open major", "Open major (imported)", "Spikes", "Spikes (imported)"], names);
    }

    [Fact]
    public async Task An_import_takes_one_backup_and_returns_its_path()
    {
        await using var source = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(source);
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.AllData());
        await using var target = await TransferWorld.CreateAsync();

        var result = await target.Transfer.ImportJsonAsync(json);

        Assert.Equal(1, target.Backup.Count);
        Assert.Equal("backup-1.db.bak", result.BackupPath);
    }

    [Fact]
    public async Task A_parent_completed_with_an_open_sub_item_is_reopened_when_auto_complete_applies()
    {
        await using var source = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(source);
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.AllData());
        var edited = TransferJson.Edit(json, document =>
            TransferJson.Item(document, "Fix invoice totals")["completedAtUtc"] = "2026-11-13T11:00:00Z");
        await using var target = await TransferWorld.CreateAsync();

        await target.Transfer.ImportJsonAsync(edited);

        var billing = (await target.ReadProjectsAsync()).Single(project => project.Name == "Billing");
        var parent = (await target.ReadItemsAsync(billing.Id)).Single(item => item.Title == "Fix invoice totals");
        Assert.Null(parent.CompletedAtUtc);
    }

    [Fact]
    public async Task A_parent_stays_completed_when_the_project_override_turns_auto_complete_off()
    {
        await using var source = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(source);
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.AllData());
        var edited = TransferJson.Edit(json, document =>
        {
            TransferJson.Item(document, "Fix invoice totals")["completedAtUtc"] = "2026-11-13T11:00:00Z";
            TransferJson.Project(document, "Billing")["settings"]!["autoCompleteParents"] = "false";
        });
        await using var target = await TransferWorld.CreateAsync();

        await target.Transfer.ImportJsonAsync(edited);

        var billing = (await target.ReadProjectsAsync()).Single(project => project.Name == "Billing");
        var parent = (await target.ReadItemsAsync(billing.Id)).Single(item => item.Title == "Fix invoice totals");
        Assert.NotNull(parent.CompletedAtUtc);
    }

    [Fact]
    public async Task Import_does_not_depend_on_the_current_culture()
    {
        await using var source = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(source);
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.AllData());
        await using var target = await TransferWorld.CreateAsync();

        using var german = TransferCulture.Use("de-DE");
        var result = await target.Transfer.ImportJsonAsync(json);
        var exported = await target.Transfer.ExportJsonAsync(new TransferScope.AllData());

        Assert.True(result.Succeeded, string.Join("; ", result.Issues));
        Assert.Equal(TransferJson.WithoutIds(json), TransferJson.WithoutIds(exported));
    }

    [Fact]
    public async Task A_file_with_nothing_to_import_succeeds_and_changes_nothing_but_the_backup()
    {
        await using var world = await TransferWorld.CreateAsync();
        var before = await world.CountRowsAsync();

        var result = await world.Transfer.ImportJsonAsync("{\"format\":\"task-tracker\",\"version\":1}");

        Assert.True(result.Succeeded);
        Assert.Equal(TransferSummary.Empty, result.Summary);
        Assert.Equal(before, await world.CountRowsAsync());
    }

    [Fact]
    public async Task Built_in_lookups_by_the_same_name_are_reused_not_duplicated()
    {
        await using var source = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(source);
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.AllData());
        await using var target = await TransferWorld.CreateAsync();

        await target.Transfer.ImportJsonAsync(json);

        var billing = (await target.ReadProjectsAsync()).Single(project => project.Name == "Billing");
        var fix = (await target.ReadItemsAsync(billing.Id)).Single(item => item.Title == "Fix invoice totals");
        Assert.Equal(BuiltInLookups.ChangeId, fix.ItemTypeId);
        Assert.Equal(BuiltInLookups.HighId, fix.PriorityLevelId);
    }
}