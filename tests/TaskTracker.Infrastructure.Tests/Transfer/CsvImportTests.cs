#pragma warning disable xUnit1051
using TaskTracker.Core;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Transfer;

namespace TaskTracker.Infrastructure.Tests.Transfer;

public sealed class CsvImportTests
{
    [Fact]
    public async Task The_preview_counts_rows_and_reports_how_columns_were_understood()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);
        var csv = "Title,Type,Priority,Severity,Project,Mystery\r\nOne,Change,High,Major,Billing,x\r\nTwo,,,,Billing,y\r\n";

        var preview = await world.Transfer.PreviewCsvAsync(csv, ids.BillingId, null);

        Assert.Equal(2, preview.RowCount);
        Assert.Equal(["Title", "Type", "Priority", "Severity"], preview.RecognizedColumns);
        Assert.Equal(["Mystery"], preview.UnknownColumns);
        Assert.Equal(["Project"], preview.IgnoredColumns);
        Assert.Equal(["One", "Two"], preview.SampleRows.Select(row => row.Title));
        Assert.True(preview.CanImport);
    }

    [Fact]
    public async Task The_preview_shows_only_the_first_rows_but_counts_them_all()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);
        var rows = string.Concat(Enumerable.Range(1, 12).Select(number => $"Item {number}\r\n"));

        var preview = await world.Transfer.PreviewCsvAsync("Title\r\n" + rows, ids.BillingId, null);

        Assert.Equal(12, preview.RowCount);
        Assert.Equal(5, preview.SampleRows.Count);
    }

    [Fact]
    public async Task Rows_become_top_level_items_at_the_end_of_the_project_root()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);
        var csv = "title,TYPE,priority,Ticket,Due date,Due time,Scheduled start,Scheduled end,Description\r\n" +
            "Plan,change,HIGH,T-1,2026-12-01,09:30,2026-12-02 10:00,2026-12-02T11:30,\"Line one\r\nline two, with comma\"\r\n";

        var result = await world.Transfer.ImportCsvAsync(csv, ids.BillingId, null);

        Assert.True(result.Succeeded, string.Join("; ", result.Issues));
        Assert.Equal(1, result.Summary.Items);
        var items = await world.ReadItemsAsync(ids.BillingId);
        var created = items.Single(item => item.Title == "Plan");
        Assert.Null(created.ParentItemId);
        Assert.Null(created.FolderId);
        Assert.Equal(BuiltInLookups.ChangeId, created.ItemTypeId);
        Assert.Equal(BuiltInLookups.HighId, created.PriorityLevelId);
        Assert.Equal("T-1", created.TicketNumber);
        var existingTicket = items.Single(item => item.Id == ids.FixItemId);
        Assert.NotNull(created.TicketRank);
        Assert.Equal(existingTicket.TicketRank + 1, created.TicketRank);
        Assert.Equal(new DateOnly(2026, 12, 1), created.DueDate);
        Assert.Equal(new TimeOnly(9, 30), created.DueTime);
        Assert.Equal(new DateTime(2026, 12, 2, 10, 0, 0), created.ScheduledStart);
        Assert.Equal(new DateTime(2026, 12, 2, 11, 30, 0), created.ScheduledEnd);
        Assert.Equal("Line one\r\nline two, with comma", created.Description);
        var topLevel = items.Where(item => item.FolderId is null && item.ParentItemId is null && item.DeletedAtUtc is null);
        Assert.Equal(created.Id, topLevel.OrderBy(item => item.SortOrder).Last().Id);
    }

    [Fact]
    public async Task Rows_can_be_imported_into_a_folder()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);

        var result = await world.Transfer.ImportCsvAsync("Title\r\nIn tables\r\n", ids.BillingId, ids.TablesFolderId);

        Assert.True(result.Succeeded);
        var created = (await world.ReadItemsAsync(ids.BillingId)).Single(item => item.Title == "In tables");
        Assert.Equal(ids.TablesFolderId, created.FolderId);
    }

    [Fact]
    public async Task Custom_fields_are_matched_by_display_name_and_values_are_validated_per_type()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);
        var csv = "Title,severity,Estimate,Reviewed,Flag,Notes,Customer\r\nRow,major,3.75,2026-10-01,No,  trimmed  ,Zed\r\n";

        var result = await world.Transfer.ImportCsvAsync(csv, ids.BillingId, null);

        Assert.True(result.Succeeded, string.Join("; ", result.Issues));
        var created = (await world.ReadItemsAsync(ids.BillingId)).Single(item => item.Title == "Row");
        var values = await world.ReadValuesAsync(created.Id);
        Assert.Equal(6, values.Count);
        Assert.Equal(3.75, values.Single(value => value.FieldDefinitionId == ids.EstimateFieldId).NumberValue);
        Assert.Equal(ids.MajorChoiceId, values.Single(value => value.FieldDefinitionId == ids.SeverityFieldId).ChoiceId);
        Assert.Equal("Zed", values.Single(value => value.FieldDefinitionId == ids.CustomerFieldId).TextValue);
        Assert.Contains(values, value => value.BoolValue == false);
        Assert.Contains(values, value => value.TextValue == "trimmed");
    }

    [Fact]
    public async Task Empty_cells_create_no_values_and_a_row_may_have_fewer_cells_than_the_header()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);

        var result = await world.Transfer.ImportCsvAsync("Title,Estimate,Notes\r\nShort\r\nEmpty,,\r\n", ids.BillingId, null);

        Assert.True(result.Succeeded);
        var items = await world.ReadItemsAsync(ids.BillingId);
        foreach (var title in new[] { "Short", "Empty" })
        {
            Assert.Empty(await world.ReadValuesAsync(items.Single(item => item.Title == title).Id));
        }
    }

    [Fact]
    public async Task Completed_yes_without_a_time_completes_now_and_a_given_time_is_kept()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);
        var csv = "Title,Completed,Completed at\r\nA,yes,\r\nB,yes,2026-10-01T08:00:00Z\r\nC,no,\r\nD,,2026-10-02T08:00:00Z\r\n";

        await world.Transfer.ImportCsvAsync(csv, ids.BillingId, null);

        var items = await world.ReadItemsAsync(ids.BillingId);
        Assert.Equal(world.Store.Clock.GetUtcNow().UtcDateTime, items.Single(item => item.Title == "A").CompletedAtUtc);
        Assert.Equal(new DateTime(2026, 10, 1, 8, 0, 0, DateTimeKind.Utc), items.Single(item => item.Title == "B").CompletedAtUtc);
        Assert.Null(items.Single(item => item.Title == "C").CompletedAtUtc);
        Assert.Equal(new DateTime(2026, 10, 2, 8, 0, 0, DateTimeKind.Utc), items.Single(item => item.Title == "D").CompletedAtUtc);
    }

    [Fact]
    public async Task Parent_title_is_ignored_and_every_row_becomes_a_top_level_item()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);

        await world.Transfer.ImportCsvAsync("Title,Parent title\r\nChild,Fix invoice totals\r\n", ids.BillingId, null);

        var child = (await world.ReadItemsAsync(ids.BillingId)).Single(item => item.Title == "Child");
        Assert.Null(child.ParentItemId);
    }

    [Fact]
    public async Task Errors_carry_row_numbers_and_columns_and_list_the_valid_names()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);
        var csv = "Title,Type,Priority,Due date,Estimate,Severity\r\n" +
            "Good,Change,High,2026-12-01,1,Major\r\n" +
            "Bad type,Bug,High,2026-12-01,1,Major\r\n" +
            ",Change,Urgent,13/01/2026,abc,Huge\r\n";

        var preview = await world.Transfer.PreviewCsvAsync(csv, ids.BillingId, null);

        Assert.False(preview.CanImport);
        var paths = preview.Issues.Select(issue => issue.Path).ToList();
        Assert.Equal(["Row 3, Type", "Row 4, Title", "Row 4, Due date", "Row 4, Estimate", "Row 4, Severity"], paths);
        Assert.Contains("Change, Error, Discussion, Spike", preview.Issues[0].Message);
        Assert.Contains("'Bug'", preview.Issues[0].Message);
        Assert.Contains("Minor, Major", preview.Issues[4].Message);
        Assert.Equal([false, true, true], preview.SampleRows.Select(row => row.HasError));
    }

    [Fact]
    public async Task One_bad_row_stops_the_whole_import()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);
        var before = await world.CountRowsAsync();

        var result = await world.Transfer.ImportCsvAsync("Title,Type\r\nFine,Change\r\nBroken,Nope\r\n", ids.BillingId, null);

        Assert.False(result.Succeeded);
        Assert.Equal("Row 3, Type", Assert.Single(result.Issues).Path);
        Assert.Equal(before, await world.CountRowsAsync());
        Assert.Equal(0, world.Backup.Count);
    }

    [Fact]
    public async Task An_archived_priority_is_refused_so_old_values_do_not_slip_in()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);

        var preview = await world.Transfer.PreviewCsvAsync("Title,Priority\r\nX,Someday\r\n", ids.BillingId, null);

        Assert.Contains("archived", Assert.Single(preview.Issues).Message);
    }

    [Fact]
    public async Task Unknown_lookup_values_never_create_lookups()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);
        var before = await world.CountRowsAsync();

        await world.Transfer.ImportCsvAsync("Title,Type,Priority\r\nX,Bug,Whenever\r\n", ids.BillingId, null);

        Assert.Equal(before, await world.CountRowsAsync());
    }

    [Theory]
    [InlineData("Description\r\nNo title column\r\n", "Row 1", "needs a 'Title' column")]
    [InlineData("Title,title\r\nx,y\r\n", "Row 1", "more than once")]
    [InlineData("Title\r\n", "Row 2", "no item rows")]
    [InlineData("", "Row 1", "needs a header row")]
    [InlineData("Title\r\n\"never closed\r\n", "Row 2", "never closed")]
    [InlineData("Title,Ticket\r\nx,y,z\r\n", "Row 2", "3 cells but the header has 2")]
    [InlineData("Title,Due time\r\nx,15:00\r\n", "Row 2, Due time", "needs a due date")]
    [InlineData("Title,Scheduled end\r\nx,2026-12-01T10:00\r\n", "Row 2, Scheduled end", "needs a scheduled start")]
    [InlineData("Title,Completed\r\nx,maybe\r\n", "Row 2, Completed", "yes or no")]
    [InlineData("Title,Completed,Completed at\r\nx,no,2026-10-01T08:00:00Z\r\n", "Row 2, Completed at", "says no")]
    public async Task Structural_problems_are_reported_with_their_row(string csv, string path, string messagePart)
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);

        var preview = await world.Transfer.PreviewCsvAsync(csv, ids.BillingId, null);

        Assert.False(preview.CanImport);
        var issue = Assert.Single(preview.Issues, candidate => candidate.Path == path);
        Assert.Contains(messagePart, issue.Message);
    }

    [Fact]
    public async Task A_byte_order_mark_and_other_line_endings_are_accepted()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);

        var result = await world.Transfer.ImportCsvAsync($"{(char)0xFEFF}Title\nOne\rTwo\r\nThree", ids.BillingId, null);

        Assert.True(result.Succeeded, string.Join("; ", result.Issues));
        Assert.Equal(3, result.Summary.Items);
    }

    [Fact]
    public async Task Exported_rows_import_back_with_commas_quotes_line_breaks_and_padding_intact()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);
        var tricky = await world.Projects.CreateAsync("Tricky");
        var item = await world.Items.CreateAsync(tricky.Id, null, null, "Say \"hi\", then leave");
        var edit = new TaskTracker.Core.Items.ItemEdit(
            item.Title, "  padded, \"quoted\"\r\nsecond line  ", null, null, null, null, null, null, null);
        await world.Items.EditAsync(item.Id, edit);
        var csv = await world.Transfer.ExportProjectCsvAsync(tricky.Id);
        var target = await world.Projects.CreateAsync("Target");

        var result = await world.Transfer.ImportCsvAsync(csv, target.Id, null);

        Assert.True(result.Succeeded, string.Join("; ", result.Issues));
        var copy = Assert.Single(await world.ReadItemsAsync(target.Id));
        Assert.Equal("Say \"hi\", then leave", copy.Title);
        Assert.Equal("  padded, \"quoted\"\r\nsecond line  ", copy.Description);
        Assert.NotEqual(ids.BillingId, target.Id);
    }

    [Fact]
    public async Task A_whole_project_export_imports_into_another_project_with_its_values()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);
        var csv = await world.Transfer.ExportProjectCsvAsync(ids.HomeLabId);
        var other = await world.Projects.CreateAsync("Copy target");

        var result = await world.Transfer.ImportCsvAsync(csv, other.Id, null);

        Assert.True(result.Succeeded, string.Join("; ", result.Issues));
        Assert.Equal("Replace router", Assert.Single(await world.ReadItemsAsync(other.Id)).Title);
    }

    [Fact]
    public async Task Import_reads_numbers_and_dates_the_same_under_another_culture()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);

        using var german = TransferCulture.Use("de-DE");
        var result = await world.Transfer.ImportCsvAsync(
            "Title,Estimate,Due date\r\nGerman machine,2.5,2026-12-24\r\n", ids.BillingId, null);

        Assert.True(result.Succeeded, string.Join("; ", result.Issues));
        var created = (await world.ReadItemsAsync(ids.BillingId)).Single(item => item.Title == "German machine");
        Assert.Equal(new DateOnly(2026, 12, 24), created.DueDate);
        var value = Assert.Single(await world.ReadValuesAsync(created.Id));
        Assert.Equal(2.5, value.NumberValue);
    }

    [Fact]
    public async Task A_decimal_comma_is_refused_with_a_hint()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);

        var preview = await world.Transfer.PreviewCsvAsync("Title,Estimate\r\nX,\"2,5\"\r\n", ids.BillingId, null);

        Assert.Contains("use a dot", Assert.Single(preview.Issues).Message);
    }

    [Fact]
    public async Task A_missing_project_or_folder_is_a_rule_error()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);

        await Assert.ThrowsAsync<DomainRuleException>(() =>
            world.Transfer.PreviewCsvAsync("Title\r\nx\r\n", ids.TrashedProjectId, null));
        await Assert.ThrowsAsync<DomainRuleException>(() =>
            world.Transfer.ImportCsvAsync("Title\r\nx\r\n", ids.BillingId, Guid.NewGuid()));
    }

    [Fact]
    public async Task A_successful_import_takes_a_backup_first()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);

        var result = await world.Transfer.ImportCsvAsync("Title\r\nx\r\n", ids.BillingId, null);

        Assert.Equal(1, world.Backup.Count);
        Assert.Equal("backup-1.db.bak", result.BackupPath);
    }

    [Fact]
    public async Task An_archived_field_has_no_column_to_import_into()
    {
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);

        var preview = await world.Transfer.PreviewCsvAsync("Title,Old note\r\nx,y\r\n", ids.BillingId, null);

        Assert.Equal(["Old note"], preview.UnknownColumns);
        Assert.True(preview.CanImport);
        Assert.Equal(FieldDataType.Text, (await world.ReadFieldsAsync()).Single(field => field.Key == "old-note").DataType);
    }
}