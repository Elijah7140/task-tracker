#pragma warning disable xUnit1051
using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.SavedSearches;
using TaskTracker.Core.Search;
using TaskTracker.Core.Settings;

namespace TaskTracker.Infrastructure.Tests.Transfer;

/// <summary>The ids of the rows <see cref="TransferSeed"/> creates.</summary>
internal sealed record SeedIds(
    Guid BillingId,
    Guid HomeLabId,
    Guid TrashedProjectId,
    Guid TablesFolderId,
    Guid SpikeTypeId,
    Guid SeverityFieldId,
    Guid MajorChoiceId,
    Guid EstimateFieldId,
    Guid CustomerFieldId,
    Guid FixItemId,
    Guid AddIndexItemId,
    Guid LabItemId);

/// <summary>Fills a database with a small but rich data set: every field type, folders, sub-items, trash and searches.</summary>
internal static class TransferSeed
{
    public static async Task<SeedIds> PopulateAsync(TransferWorld world)
    {
        var spike = await world.Lookups.AddItemTypeAsync("Spike");
        var urgent = await world.Lookups.AddPriorityLevelAsync("Urgent");
        var someday = await world.Lookups.AddPriorityLevelAsync("Someday");
        await world.Lookups.ArchivePriorityLevelAsync(someday.Id);
        var fields = await CreateFieldsAsync(world);

        var billing = await world.Projects.CreateAsync("Billing");
        var homeLab = await world.Projects.CreateAsync("Home Lab");
        await world.Projects.ReorderAsync([billing.Id, homeLab.Id]);
        var customer = await world.Fields.CreateAsync("Customer", FieldDataType.Text, billing.Id);
        var dbo = await world.Folders.CreateAsync(billing.Id, null, "dbo");
        var tables = await world.Folders.CreateAsync(billing.Id, dbo.Id, "Tables");
        await world.Folders.CreateAsync(billing.Id, dbo.Id, "Views");

        var fix = await CreateFixItemAsync(world, billing.Id, fields, customer);
        await CreateSubItemsAsync(world, billing.Id, fix.Id);
        var addIndex = await CreateScheduledItemAsync(world, billing.Id, tables.Id, spike.Id, urgent.Id);
        await CreateDeletedItemAsync(world, billing.Id, fields.Notes);
        var labItem = await world.Items.CreateAsync(homeLab.Id, null, null, "Replace router");
        var trashed = await CreateTrashedProjectAsync(world);

        await world.Settings.SetProjectOverrideAsync(billing.Id, SettingsCatalogue.UrgencyYellowThreshold, TimeSpan.FromDays(5));
        await CreateSavedSearchesAsync(world, billing.Id, spike.Id, fields.MajorChoiceId);

        return new SeedIds(billing.Id, homeLab.Id, trashed, tables.Id, spike.Id, fields.Severity.Id, fields.MajorChoiceId,
            fields.Estimate.Id, customer.Id, fix.Id, addIndex.Id, labItem.Id);
    }

    private static async Task<SeedFields> CreateFieldsAsync(TransferWorld world)
    {
        var severity = await world.Fields.CreateAsync("Severity", FieldDataType.Choice, null);
        await world.Fields.AddChoiceAsync(severity.Id, "Minor");
        var major = await world.Fields.AddChoiceAsync(severity.Id, "Major");
        var legacy = await world.Fields.AddChoiceAsync(severity.Id, "Legacy");
        await world.Fields.ArchiveChoiceAsync(severity.Id, legacy.Id);
        var estimate = await world.Fields.CreateAsync("Estimate", FieldDataType.Number, null);
        var reviewed = await world.Fields.CreateAsync("Reviewed", FieldDataType.Date, null);
        var flag = await world.Fields.CreateAsync("Flag", FieldDataType.Boolean, null);
        var notes = await world.Fields.CreateAsync("Notes", FieldDataType.Text, null);
        var oldNote = await world.Fields.CreateAsync("Old note", FieldDataType.Text, null);
        await world.Fields.ArchiveAsync(oldNote.Id);

        return new SeedFields(severity, major.Id, estimate, reviewed, flag, notes);
    }

    private static async Task<TodoItem> CreateFixItemAsync(
        TransferWorld world, Guid projectId, SeedFields fields, FieldDefinition customer)
    {
        var item = await world.Items.CreateAsync(projectId, null, null, "Fix invoice totals");
        var edit = new ItemEdit(
            "Fix invoice totals", "Totals are wrong,\nsee the \"Q4\" report", "JIRA-1",
            BuiltInLookups.ChangeId, BuiltInLookups.HighId, new DateOnly(2026, 11, 20), new TimeOnly(15, 0), null, null);
        var values = new List<FieldValueInput>
        {
            new(fields.Severity.Id, ChoiceId: fields.MajorChoiceId),
            new(fields.Estimate.Id, NumberValue: 2.5),
            new(fields.Reviewed.Id, DateValue: new DateOnly(2026, 11, 1)),
            new(fields.Flag.Id, BoolValue: true),
            new(fields.Notes.Id, TextValue: "Needs a look"),
            new(customer.Id, TextValue: "Acme, Inc.")
        };

        await world.Items.EditAsync(item.Id, edit, values);
        world.Store.Clock.Advance(TimeSpan.FromSeconds(1));

        return item;
    }

    private static async Task CreateSubItemsAsync(TransferWorld world, Guid projectId, Guid parentId)
    {
        var done = await world.Items.CreateAsync(projectId, null, parentId, "Check query plan");
        await world.Items.CreateAsync(projectId, null, parentId, "Write regression test");
        await world.Items.SetCompletedAsync(projectId, null, done.Id, true);
        world.Store.Clock.Advance(TimeSpan.FromSeconds(1));
    }

    private static async Task<TodoItem> CreateScheduledItemAsync(
        TransferWorld world, Guid projectId, Guid folderId, Guid typeId, Guid priorityId)
    {
        var item = await world.Items.CreateAsync(projectId, folderId, null, "Add index");
        var start = new DateTime(2026, 11, 21, 9, 0, 0, DateTimeKind.Unspecified);
        var edit = new ItemEdit("Add index", null, null, typeId, priorityId, new DateOnly(2026, 11, 22), null,
            start, start.AddMinutes(90));

        await world.Items.EditAsync(item.Id, edit);
        await world.Items.SetCompletedAsync(projectId, folderId, item.Id, true);
        world.Store.Clock.Advance(TimeSpan.FromSeconds(1));

        return item;
    }

    private static async Task CreateDeletedItemAsync(TransferWorld world, Guid projectId, FieldDefinition notes)
    {
        var item = await world.Items.CreateAsync(projectId, null, null, "Old idea");
        var edit = new ItemEdit("Old idea", null, null, null, null, null, null, null, null);
        await world.Items.EditAsync(item.Id, edit, [new FieldValueInput(notes.Id, TextValue: "gone")]);
        await world.Items.DeleteAsync(projectId, null, item.Id);
    }

    private static async Task<Guid> CreateTrashedProjectAsync(TransferWorld world)
    {
        var project = await world.Projects.CreateAsync("Trashed");
        await world.Items.CreateAsync(project.Id, null, null, "In the bin");
        await world.Projects.DeleteAsync(project.Id);

        return project.Id;
    }

    private static async Task CreateSavedSearchesAsync(TransferWorld world, Guid projectId, Guid spikeId, Guid majorId)
    {
        await world.SavedSearches.SaveAsync("Open major",
            new SavedSearchDefinition($"severity:#{majorId}", new SearchScope.Project(projectId), false));
        await world.SavedSearches.SaveAsync("Spikes",
            new SavedSearchDefinition($"type:#{spikeId}", new SearchScope.AllProjects(), true));
    }

    private sealed record SeedFields(
        FieldDefinition Severity,
        Guid MajorChoiceId,
        FieldDefinition Estimate,
        FieldDefinition Reviewed,
        FieldDefinition Flag,
        FieldDefinition Notes);
}