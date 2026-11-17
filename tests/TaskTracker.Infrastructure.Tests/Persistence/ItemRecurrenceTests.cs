#pragma warning disable xUnit1051
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

using TaskTracker.Core.Completion;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Items.Recurrence;
using TaskTracker.Core.Search;
using TaskTracker.Core.Search.Syntax;

namespace TaskTracker.Infrastructure.Tests.Persistence;

/// <summary>Persisted occurrences and their undo, restore and search behavior.</summary>
public sealed class ItemRecurrenceTests
{
    private static readonly DateOnly Due = new(2026, 11, 13);
    private static readonly RecurrenceRule Weekly = new(RecurrenceFrequency.Weekly, Weekdays: RecurrenceWeekdays.Friday);

    [Fact]
    public async Task Completing_the_last_child_copies_the_repeating_parent_and_undo_removes_the_copy()
    {
        await using var world = await UndoWorld.CreateAsync();
        var parent = await world.Items.CreateAsync(world.Project.Id, null, null, "Audit");
        var child = await world.Items.CreateAsync(world.Project.Id, null, parent.Id, "Check figures");
        var sibling = await world.Items.CreateAsync(world.Project.Id, null, null, "Other work");
        await SetUpParentAsync(world, parent);
        await world.Items.EditAsync(child.Id, RepeatEdit(child.Title, null));

        await world.Items.SetCompletedAsync(world.Project.Id, null, child.Id, true);

        var next = await AssertCopiedTreeAsync(world, parent, sibling);
        Assert.NotNull((await world.ReadItemAsync(parent.Id)).CompletedAtUtc);
        Assert.Equal("Complete 'Check figures'", world.History.UndoDescription);

        await world.History.UndoAsync();

        Assert.False(await world.ItemExistsAsync(next.Id));
        Assert.Null((await world.ReadItemAsync(parent.Id)).CompletedAtUtc);
        Assert.Null((await world.ReadItemAsync(child.Id)).CompletedAtUtc);
        Assert.Equal(1, (await world.ReadItemAsync(sibling.Id)).SortOrder);
        await world.History.RedoAsync();
        await AssertCopiedTreeAsync(world, parent, sibling);
    }

    [Fact]
    public async Task Skip_moves_the_same_row_and_undo_restores_dates_and_the_count()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Audit");
        var rule = Weekly with { EndKind = RecurrenceEndKind.AfterCount, Remaining = 2 };
        var edit = RepeatEdit(item.Title, rule);
        await world.Items.EditAsync(item.Id, edit);

        var advanced = await world.Items.SkipRepeatAsync(item.Id);
        var skipped = await world.ReadItemAsync(item.Id);

        Assert.True(advanced);
        Assert.Null(skipped.CompletedAtUtc);
        Assert.Equal(Due.AddDays(7), skipped.DueDate);
        Assert.Equal(edit.ScheduledStart!.Value.AddDays(7), skipped.ScheduledStart);
        Assert.Equal(1, skipped.Recurrence!.Value.Remaining);
        Assert.Equal("Skip repeat for 'Audit'", world.History.UndoDescription);
        Assert.False(await world.Items.SkipRepeatAsync(item.Id));

        await world.History.UndoAsync();

        var restored = await world.ReadItemAsync(item.Id);
        Assert.Equal(Due, restored.DueDate);
        Assert.Equal(edit.ScheduledStart, restored.ScheduledStart);
        Assert.Equal(rule, restored.Recurrence);
        Assert.Equal(skipped.RecurrenceSeriesId, restored.RecurrenceSeriesId);
    }

    [Fact]
    public async Task Reopening_keeps_the_next_occurrence_and_stopping_only_removes_the_selected_rule()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Audit");
        await world.Items.EditAsync(item.Id, RepeatEdit(item.Title, Weekly));
        await world.Items.SetCompletedAsync(world.Project.Id, null, item.Id, true);

        await world.Items.SetCompletedAsync(world.Project.Id, null, item.Id, false);
        await world.Items.StopRepeatingAsync(item.Id);

        var other = Assert.Single((await world.Items.LoadAreaAsync(world.Project.Id, null)).Items, row => row.Item.Id != item.Id);
        Assert.Equal(Weekly, other.Item.Recurrence);
        Assert.Null((await world.ReadItemAsync(item.Id)).Recurrence);
        Assert.Equal("Stop repeating 'Audit'", world.History.UndoDescription);

        await world.History.UndoAsync();

        Assert.Equal(Weekly, (await world.ReadItemAsync(item.Id)).Recurrence);
    }

    [Fact]
    public async Task Completing_the_final_occurrence_keeps_it_as_history_and_returns_the_end_status()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Audit");
        var rule = Weekly with { EndKind = RecurrenceEndKind.AfterCount, Remaining = 1 };
        await world.Items.EditAsync(item.Id, RepeatEdit(item.Title, rule));

        var completion = await world.Items.SetCompletedAsync(world.Project.Id, null, item.Id, true);

        Assert.True(Assert.IsType<CompletionResult.Applied>(completion).LastRepeat);
        var stored = Assert.Single((await world.Items.LoadAreaAsync(world.Project.Id, null)).Items).Item;
        Assert.Equal(item.Id, stored.Id);
        Assert.NotNull(stored.CompletedAtUtc);
        Assert.Equal(rule, stored.Recurrence);
    }

    [Fact]
    public async Task Trash_restore_keeps_the_original_rule_and_series()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Audit");
        await world.Items.EditAsync(item.Id, RepeatEdit(item.Title, Weekly));
        var series = (await world.ReadItemAsync(item.Id)).RecurrenceSeriesId;

        var batch = await world.Items.DeleteAsync(world.Project.Id, null, item.Id);
        await world.Trash.RestoreAsync(batch);

        var restored = await world.ReadItemAsync(item.Id);
        Assert.Null(restored.DeletedAtUtc);
        Assert.Equal(Weekly, restored.Recurrence);
        Assert.Equal(series, restored.RecurrenceSeriesId);
    }

    [Theory]
    [InlineData("is:recurring", true)]
    [InlineData("repeats:yes", true)]
    [InlineData("repeats:no", false)]
    public async Task The_query_keyword_and_boolean_filter_find_the_correct_items(string text, bool matchesRepeat)
    {
        await using var world = await UndoWorld.CreateAsync();
        var repeating = await world.Items.CreateAsync(world.Project.Id, null, null, "Audit");
        var plain = await world.Items.CreateAsync(world.Project.Id, null, null, "Plain");
        await world.Items.EditAsync(repeating.Id, RepeatEdit(repeating.Title, Weekly));
        var fields = new SearchableField[] { new("repeats", "Repeats", FieldDataType.Boolean, null) };
        var parsed = new ItemQueryParser(world.Clock, TimeZoneInfo.Utc).Parse(text, fields, new Dictionary<string, IReadOnlyList<SearchChoice>>());

        var results = await world.Search.SearchAsync(new ItemQuery(new SearchScope.AllProjects(), null, parsed.Filters, true));

        Assert.Empty(parsed.Errors);
        Assert.Equal(matchesRepeat ? repeating.Id : plain.Id, Assert.Single(results.Items).ItemId);
    }

    [Fact]
    public async Task A_scheduled_only_occurrence_keeps_its_times_and_repeated_completion_is_idempotent()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Meeting");
        var edit = RepeatEdit(item.Title, Weekly) with { DueDate = null, DueTime = null };
        await world.Items.EditAsync(item.Id, edit);

        await world.Items.SetCompletedAsync(world.Project.Id, null, item.Id, true);
        await world.Items.SetCompletedAsync(world.Project.Id, null, item.Id, true);

        var next = Assert.Single((await world.Items.LoadAreaAsync(world.Project.Id, null)).Items,
            node => node.Item.Id != item.Id).Item;
        Assert.Null(next.DueDate);
        Assert.Equal(edit.ScheduledStart!.Value.AddDays(7), next.ScheduledStart);
        Assert.Equal(edit.ScheduledEnd!.Value.AddDays(7), next.ScheduledEnd);
    }

    [Theory]
    [InlineData("indent")]
    [InlineData("move")]
    [InlineData("drag")]
    public async Task Moving_an_open_child_under_its_completed_sibling_keeps_the_repeating_parent_open(string operation)
    {
        await using var world = await UndoWorld.CreateAsync();
        var (parent, finished, open) = await CreateBranchAsync(world);
        var projectId = world.Project.Id;

        switch (operation)
        {
            case "indent":
                await world.Items.IndentAsync(projectId, null, open.Id);
                break;
            case "move":
                await world.Items.MoveAsync(projectId, null, open.Id, finished.Id);
                break;
            case "drag":
                await world.Items.MoveAtAsync(projectId, null, open.Id, finished.Id, 0);
                break;
        }

        var root = Assert.Single((await world.Items.LoadAreaAsync(projectId, null)).Items);
        Assert.Equal(parent.Id, root.Item.Id);
        Assert.Null(root.Item.CompletedAtUtc);
        var child = Assert.Single(root.Children);
        Assert.Equal(finished.Id, child.Item.Id);
        Assert.Null(child.Item.CompletedAtUtc);
        Assert.Equal(open.Id, Assert.Single(child.Children).Item.Id);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Recompletion_keeps_one_final_occurrence_even_after_redo(bool redo)
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await CreateTwoOccurrenceSeriesAsync(world);
        var projectId = world.Project.Id;
        await world.Items.SetCompletedAsync(projectId, null, item.Id, true);
        var next = await FindSuccessorAsync(world, item.Id);
        if (redo)
        {
            await world.History.UndoAsync();
            Assert.False(await world.ItemExistsAsync(next.Id));
            await world.History.RedoAsync();
        }

        await world.Items.SetCompletedAsync(projectId, null, item.Id, false);
        await world.Items.SetCompletedAsync(projectId, null, item.Id, true);

        var final = await FindSuccessorAsync(world, item.Id);
        Assert.Equal(next.Id, final.Id);
        Assert.Null(final.CompletedAtUtc);
        Assert.Equal(1, final.Recurrence?.Remaining);
    }

    [Fact]
    public async Task Undo_of_completion_allows_a_new_successor_when_completed_again()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await CreateTwoOccurrenceSeriesAsync(world);
        var projectId = world.Project.Id;
        await world.Items.SetCompletedAsync(projectId, null, item.Id, true);
        var next = await FindSuccessorAsync(world, item.Id);

        await world.History.UndoAsync();
        await world.Items.SetCompletedAsync(projectId, null, item.Id, true);

        Assert.NotEqual(next.Id, (await FindSuccessorAsync(world, item.Id)).Id);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Recompletion_does_not_replace_a_deleted_successor(bool purge)
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await CreateTwoOccurrenceSeriesAsync(world);
        var projectId = world.Project.Id;
        await world.Items.SetCompletedAsync(projectId, null, item.Id, true);
        var next = await FindSuccessorAsync(world, item.Id);
        var batch = await world.Items.DeleteAsync(projectId, null, next.Id);
        if (purge)
        {
            await world.Trash.PurgeAsync(batch);
        }

        await world.Items.SetCompletedAsync(projectId, null, item.Id, false);
        await world.Items.SetCompletedAsync(projectId, null, item.Id, true);

        var root = Assert.Single((await world.Items.LoadAreaAsync(projectId, null)).Items);
        Assert.Equal(item.Id, root.Item.Id);
        Assert.NotNull(root.Item.CompletedAtUtc);
    }

    [Fact]
    public async Task Deleting_the_last_open_child_while_its_completion_saves_creates_one_successor()
    {
        await using var world = await UndoWorld.CreateAsync();
        var (parent, _, open) = await CreateBranchAsync(world);
        var projectId = world.Project.Id;
        var pause = new PauseBeforeSave();
        var completionService = world.CreateItemService(pause);

        var completion = completionService.SetCompletedAsync(projectId, null, open.Id, true);
        Task<Guid> deletion;
        try
        {
            await pause.Reached.Task.WaitAsync(TimeSpan.FromSeconds(10));
            deletion = world.Items.DeleteAsync(projectId, null, open.Id);
        }
        finally
        {
            pause.Resume.SetResult();
        }

        await completion;
        await deletion;
        var next = await FindSuccessorAsync(world, parent.Id);
        Assert.Null(next.CompletedAtUtc);
        Assert.NotNull((await world.ReadItemAsync(parent.Id)).CompletedAtUtc);
        Assert.NotNull((await world.ReadItemAsync(open.Id)).DeletedAtUtc);
    }

    private static async Task<(TodoItem Parent, TodoItem Finished, TodoItem Open)> CreateBranchAsync(UndoWorld world)
    {
        var projectId = world.Project.Id;
        var parent = await world.Items.CreateAsync(projectId, null, null, "Audit");
        var finished = await world.Items.CreateAsync(projectId, null, parent.Id, "Complete");
        var open = await world.Items.CreateAsync(projectId, null, parent.Id, "Open");
        await world.Items.EditAsync(parent.Id, RepeatEdit(parent.Title, Weekly));
        await world.Items.SetCompletedAsync(projectId, null, finished.Id, true);
        return (parent, finished, open);
    }

    private static async Task<TodoItem> CreateTwoOccurrenceSeriesAsync(UndoWorld world)
    {
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Audit");
        var rule = new RecurrenceRule(RecurrenceFrequency.Daily, EndKind: RecurrenceEndKind.AfterCount, Remaining: 2);
        await world.Items.EditAsync(item.Id, RepeatEdit(item.Title, rule));
        return item;
    }

    private static async Task<TodoItem> FindSuccessorAsync(UndoWorld world, Guid sourceId)
    {
        var area = await world.Items.LoadAreaAsync(world.Project.Id, null);
        return Assert.Single(area.Items, row => row.Item.Id != sourceId).Item;
    }

    private sealed class PauseBeforeSave : SaveChangesInterceptor
    {
        public TaskCompletionSource Reached { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public TaskCompletionSource Resume { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData,
            InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            Reached.SetResult();
            await Resume.Task.WaitAsync(cancellationToken);
            return result;
        }
    }

    private static async Task SetUpParentAsync(UndoWorld world, TodoItem parent)
    {
        var field = await world.Fields.CreateAsync("Result", FieldDataType.Text, null);
        var edit = RepeatEdit(parent.Title, Weekly);
        await world.Items.EditAsync(parent.Id, edit, [new FieldValueInput(field.Id, TextValue: "verified")],
            [new ItemLinkInput(null, "https://example.com/audit", "Runbook")]);
    }

    private static async Task<TodoItem> AssertCopiedTreeAsync(UndoWorld world, TodoItem parent, TodoItem sibling)
    {
        await using var reader = world.OpenContext();
        var roots = await reader.TodoItems.Where(item => item.ParentItemId == null).OrderBy(item => item.SortOrder).ToListAsync();
        Assert.Equal(3, roots.Count);
        var next = roots[1];
        var child = await reader.TodoItems.SingleAsync(item => item.ParentItemId == next.Id);
        var value = await reader.ItemFieldValues.SingleAsync(row => row.ItemId == next.Id);
        var link = await reader.ItemLinks.SingleAsync(row => row.ItemId == next.Id);
        Assert.Equal(sibling.Id, roots[2].Id);
        Assert.Equal(parent.Title, next.Title);
        Assert.Equal("Details", next.Description);
        Assert.Equal("AUD-1", next.TicketNumber);
        Assert.Null(next.CompletedAtUtc);
        Assert.Equal(roots[0].RecurrenceSeriesId, next.RecurrenceSeriesId);
        Assert.Equal(Weekly, next.Recurrence);
        Assert.Equal(Due.AddDays(7), next.DueDate);
        Assert.Equal(roots[0].DueTime, next.DueTime);
        Assert.Equal(roots[0].ScheduledStart?.AddDays(7), next.ScheduledStart);
        Assert.Equal(roots[0].ScheduledEnd?.AddDays(7), next.ScheduledEnd);
        Assert.Equal("Check figures", child.Title);
        Assert.Equal(Due.AddDays(7), child.DueDate);
        Assert.Null(child.CompletedAtUtc);
        Assert.Equal("verified", value.TextValue);
        Assert.Equal("https://example.com/audit", link.Url);
        Assert.Equal("Runbook", link.Title);
        return next;
    }

    private static ItemEdit RepeatEdit(string title, RecurrenceRule? rule)
    {
        return new ItemEdit(title, "Details", "AUD-1", null, null, Due, new TimeOnly(12, 30),
            Due.ToDateTime(new TimeOnly(9, 15)), Due.ToDateTime(new TimeOnly(10, 45)))
        {
            UpdateRecurrence = true,
            Recurrence = rule
        };
    }
}