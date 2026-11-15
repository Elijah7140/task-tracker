#pragma warning disable xUnit1051
using TaskTracker.Core.Transfer;

namespace TaskTracker.Infrastructure.Tests.Transfer;

public sealed class JsonRoundTripTests
{
    [Fact]
    public async Task Exporting_importing_and_exporting_again_gives_the_same_document_apart_from_ids()
    {
        await using var source = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(source);
        var first = await source.Transfer.ExportJsonAsync(new TransferScope.AllData());
        await using var target = await TransferWorld.CreateAsync();

        var result = await target.Transfer.ImportJsonAsync(first);
        var second = await target.Transfer.ExportJsonAsync(new TransferScope.AllData());

        Assert.True(result.Succeeded, string.Join("; ", result.Issues));
        Assert.Equal(TransferJson.WithoutIds(first), TransferJson.WithoutIds(second));
    }

    [Fact]
    public async Task A_single_project_survives_the_round_trip_too()
    {
        await using var source = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(source);
        var first = await source.Transfer.ExportJsonAsync(new TransferScope.SingleProject(ids.BillingId));
        await using var target = await TransferWorld.CreateAsync();

        var result = await target.Transfer.ImportJsonAsync(first);
        var imported = Assert.Single(await target.ReadProjectsAsync());
        var second = await target.Transfer.ExportJsonAsync(new TransferScope.SingleProject(imported.Id));

        Assert.True(result.Succeeded, string.Join("; ", result.Issues));
        Assert.Equal(TransferJson.WithoutIds(first), TransferJson.WithoutIds(second));
    }

    [Fact]
    public async Task Imported_rows_get_new_ids()
    {
        await using var source = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(source);
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.AllData());
        await using var target = await TransferWorld.CreateAsync();

        await target.Transfer.ImportJsonAsync(json);

        var imported = await target.ReadProjectsAsync();
        Assert.DoesNotContain(imported, project => project.Id == ids.BillingId || project.Id == ids.HomeLabId);
        var items = await target.ReadItemsAsync(imported.Single(project => project.Name == "Billing").Id);
        Assert.DoesNotContain(items, item => item.Id == ids.FixItemId);
    }

    [Fact]
    public async Task Floating_times_and_completion_are_preserved_exactly()
    {
        await using var source = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(source);
        var original = (await source.ReadItemsAsync(ids.BillingId)).Single(item => item.Id == ids.AddIndexItemId);
        var fixItem = (await source.ReadItemsAsync(ids.BillingId)).Single(item => item.Id == ids.FixItemId);
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.AllData());
        await using var target = await TransferWorld.CreateAsync();

        await target.Transfer.ImportJsonAsync(json);

        var billing = (await target.ReadProjectsAsync()).Single(project => project.Name == "Billing");
        var items = await target.ReadItemsAsync(billing.Id);
        var copy = items.Single(item => item.Title == "Add index");
        Assert.Equal(original.ScheduledStart, copy.ScheduledStart);
        Assert.Equal(original.ScheduledEnd, copy.ScheduledEnd);
        Assert.Equal(DateTimeKind.Unspecified, copy.ScheduledStart!.Value.Kind);
        Assert.Equal(original.CompletedAtUtc, copy.CompletedAtUtc);
        Assert.Equal(original.DueDate, copy.DueDate);
        var fixCopy = items.Single(item => item.Title == "Fix invoice totals");
        Assert.Equal(fixItem.DueTime, fixCopy.DueTime);
        Assert.Equal(fixItem.Description, fixCopy.Description);
        Assert.Equal(fixItem.CreatedAtUtc, fixCopy.CreatedAtUtc);
        Assert.Equal(fixItem.UpdatedAtUtc, fixCopy.UpdatedAtUtc);
    }

    [Fact]
    public async Task Sub_items_folders_and_sort_orders_are_rebuilt()
    {
        await using var source = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(source);
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.AllData());
        await using var target = await TransferWorld.CreateAsync();

        await target.Transfer.ImportJsonAsync(json);

        var billing = (await target.ReadProjectsAsync()).Single(project => project.Name == "Billing");
        var items = await target.ReadItemsAsync(billing.Id);
        var parent = items.Single(item => item.Title == "Fix invoice totals");
        var children = items.Where(item => item.ParentItemId == parent.Id).OrderBy(item => item.SortOrder).ToList();
        Assert.Equal(["Check query plan", "Write regression test"], children.Select(child => child.Title));
        Assert.All(children, child => Assert.Equal(billing.Id, child.ProjectId));
        var inTables = items.Single(item => item.Title == "Add index");
        Assert.NotNull(inTables.FolderId);
        Assert.NotEqual(ids.TablesFolderId, inTables.FolderId);
    }

    [Fact]
    public async Task Imported_custom_values_keep_their_type_and_choice()
    {
        await using var source = await TransferWorld.CreateAsync();
        await TransferSeed.PopulateAsync(source);
        var json = await source.Transfer.ExportJsonAsync(new TransferScope.AllData());
        await using var target = await TransferWorld.CreateAsync();

        await target.Transfer.ImportJsonAsync(json);

        var billing = (await target.ReadProjectsAsync()).Single(project => project.Name == "Billing");
        var fix = (await target.ReadItemsAsync(billing.Id)).Single(item => item.Title == "Fix invoice totals");
        var values = await target.ReadValuesAsync(fix.Id);
        var fields = (await target.ReadFieldsAsync()).ToDictionary(field => field.Key);
        Assert.Equal(6, values.Count);
        Assert.Equal(2.5, values.Single(value => value.FieldDefinitionId == fields["estimate"].Id).NumberValue);
        var severity = values.Single(value => value.FieldDefinitionId == fields["severity"].Id);
        var choices = await target.ReadChoicesAsync(fields["severity"].Id);
        Assert.Equal("Major", choices.Single(choice => choice.Id == severity.ChoiceId).Label);
        Assert.Equal(billing.Id, fields["customer"].ProjectId);
    }
}