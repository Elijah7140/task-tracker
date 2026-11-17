#pragma warning disable xUnit1051
using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Items;
using TaskTracker.Core.Items.Recurrence;
using TaskTracker.Core.Transfer;

namespace TaskTracker.Infrastructure.Tests.Transfer;

/// <summary>Version 1 recurrence data and the read-only CSV representation.</summary>
public sealed class RecurrenceTransferTests
{
    private static readonly RecurrenceRule Rule = new(RecurrenceFrequency.Weekly, 2,
        RecurrenceWeekdays.Monday | RecurrenceWeekdays.Thursday, EndKind: RecurrenceEndKind.AfterCount, Remaining: 4);

    [Fact]
    public async Task Json_keeps_the_rule_and_groups_imported_occurrences_under_a_new_series()
    {
        await using var source = await CreateRepeatingProjectAsync();
        await using var target = await TransferWorld.CreateAsync();
        var text = await source.Transfer.ExportJsonAsync(new TransferScope.AllData());
        var json = TransferJson.Parse(text);
        var serialized = json["projects"]![0]!["items"]![0]!;
        var sourceSeries = serialized["recurrenceSeriesId"]!.GetValue<Guid>();

        var result = await target.Transfer.ImportJsonAsync(text);

        Assert.True(result.Succeeded, string.Join(", ", result.Issues));
        Assert.Equal(1, json["version"]!.GetValue<int>());
        Assert.Equal("weekly", serialized["recurrence"]!["frequency"]!.GetValue<string>());
        await using var reader = target.Store.Open();
        var rows = await reader.TodoItems.OrderBy(item => item.SortOrder).ToArrayAsync();
        Assert.Equal(2, rows.Length);
        Assert.Equal(Rule, rows[0].Recurrence);
        Assert.Equal(Rule with { Remaining = 3 }, rows[1].Recurrence);
        Assert.NotNull(rows[0].RecurrenceSeriesId);
        Assert.Equal(rows[0].RecurrenceSeriesId, rows[1].RecurrenceSeriesId);
        Assert.NotEqual(sourceSeries, rows[0].RecurrenceSeriesId);
    }

    [Fact]
    public async Task Json_reports_invalid_recurrence_fields_at_their_item_paths()
    {
        await using var world = await CreateRepeatingProjectAsync();
        var text = await world.Transfer.ExportJsonAsync(new TransferScope.AllData());
        var invalid = TransferJson.Edit(text, json =>
        {
            var item = json["projects"]![0]!["items"]![0]!;
            item["recurrence"]!["interval"] = 0;
            item["recurrence"]!["remaining"] = 0;
            item["recurrenceSeriesId"] = Guid.Empty;
            item["dueDate"] = null;
        });

        var result = await world.Transfer.ImportJsonAsync(invalid);

        Assert.False(result.Succeeded);
        Assert.Contains(result.Issues, issue => issue.Path == "$.projects[0].items[0].recurrence.interval");
        Assert.Contains(result.Issues, issue => issue.Path == "$.projects[0].items[0].recurrence.remaining");
        Assert.Contains(result.Issues, issue => issue.Path == "$.projects[0].items[0].recurrenceSeriesId");
        Assert.Contains(result.Issues, issue => issue.Path == "$.projects[0].items[0].recurrence");
    }

    [Fact]
    public async Task Csv_exports_the_repeat_description_and_preview_lists_it_as_ignored()
    {
        await using var source = await CreateRepeatingProjectAsync();
        await using var target = await TransferWorld.CreateAsync();
        var project = await target.Projects.CreateAsync("Imported");
        await using var reader = source.Store.Open();
        var sourceId = await reader.Projects.Select(project => project.Id).SingleAsync();

        var csv = await source.Transfer.ExportProjectCsvAsync(sourceId);
        var preview = await target.Transfer.PreviewCsvAsync(csv, project.Id, null);
        var result = await target.Transfer.ImportCsvAsync(csv, project.Id, null);

        Assert.Contains("Repeats", csv);
        Assert.Contains("Every 2 weeks on Mon, Thu", csv);
        Assert.Contains("Repeats", preview.IgnoredColumns);
        Assert.True(result.Succeeded);
        Assert.All(await target.ReadItemsAsync(project.Id), item => Assert.Null(item.Recurrence));
    }

    private static async Task<TransferWorld> CreateRepeatingProjectAsync()
    {
        var world = await TransferWorld.CreateAsync();
        var project = await world.Projects.CreateAsync("Reports");
        var item = await world.Items.CreateAsync(project.Id, null, null, "Audit");
        var edit = new ItemEdit(item.Title, null, null, null, null, new DateOnly(2026, 11, 16), null, null, null)
        {
            UpdateRecurrence = true,
            Recurrence = Rule
        };
        await world.Items.EditAsync(item.Id, edit);
        await world.Items.SetCompletedAsync(project.Id, null, item.Id, true);
        return world;
    }
}