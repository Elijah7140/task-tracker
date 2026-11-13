#pragma warning disable xUnit1051
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Completion;
using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Urgency;
using TaskTracker.Infrastructure.Persistence;

namespace TaskTracker.Infrastructure.Tests.Persistence;

public sealed class ItemServiceTests
{
    [Fact]
    public async Task Next_operation_reads_committed_item_changes()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var context = store.Open();
        var project = await store.Projects(context).CreateAsync("Project");
        var service = store.Items(context);
        var item = await service.CreateAsync(project.Id, null, null, "Original");

        await service.EditAsync(item.Id, new ItemEdit("Updated", null, null, null, null,
            null, null, null, null));
        var snapshot = await service.LoadAreaAsync(project.Id, null);
        await using var reader = store.Open();

        Assert.Equal("Updated", Assert.Single(snapshot.Items).Item.Title);
        Assert.Equal("Updated", (await reader.TodoItems.SingleAsync(row => row.Id == item.Id)).Title);
    }

    [Fact]
    public async Task Snapshot_marks_finished_nodes_and_attributes_rolled_up_urgency()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var context = store.Open();
        var project = await store.Projects(context).CreateAsync("Project");
        var service = store.Items(context);
        var openRoot = await service.CreateAsync(project.Id, null, null, "Open root");
        var finishedRoot = await service.CreateAsync(project.Id, null, null, "Finished root");
        var openChild = await service.CreateAsync(project.Id, null, openRoot.Id, "Open child");
        var finishedChild = await service.CreateAsync(project.Id, null, openRoot.Id, "Finished child");
        await service.EditAsync(openChild.Id, new ItemEdit("Open child", null, null, null, null,
            new DateOnly(2026, 11, 12), null, null, null));
        await service.SetCompletedAsync(project.Id, null, finishedChild.Id, true);
        await service.SetCompletedAsync(project.Id, null, finishedRoot.Id, true);

        await using var reader = store.Open();
        var snapshot = await store.Items(reader).LoadAreaAsync(project.Id, null);
        var root = snapshot.Items.Single(node => node.Item.Id == openRoot.Id);

        Assert.False(root.IsFinished);
        Assert.True(snapshot.Items.Single(node => node.Item.Id == finishedRoot.Id).IsFinished);
        Assert.False(root.Children.Single(node => node.Item.Id == openChild.Id).IsFinished);
        Assert.True(root.Children.Single(node => node.Item.Id == finishedChild.Id).IsFinished);
        Assert.Equal(openChild.Id, root.DisplayedUrgency.SourceDescendantId);
        Assert.Equal(Urgency.Overdue, root.DisplayedUrgency.Value);
    }

    [Fact]
    public async Task Failed_edit_does_not_leak_into_unrelated_save()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var context = store.Open();
        var projects = store.Projects(context);
        var project = await projects.CreateAsync("Original project");
        var item = await store.Items(context).CreateAsync(project.Id, null, null, "Original item");

        await Assert.ThrowsAsync<ArgumentException>(() => store.Items(context).EditAsync(item.Id,
            new ItemEdit("Rejected item", null, null, null, null, null, new TimeOnly(9, 0), null, null)));
        await projects.RenameAsync(project.Id, "Renamed project");
        await using var reader = store.Open();

        Assert.Equal("Original item", (await reader.TodoItems.SingleAsync(row => row.Id == item.Id)).Title);
        Assert.Equal("Renamed project", (await reader.Projects.SingleAsync(row => row.Id == project.Id)).Name);
    }

    [Fact]
    public async Task Moving_root_out_and_creating_another_keeps_contiguous_sibling_order()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var context = store.Open();
        var project = await store.Projects(context).CreateAsync("Project");
        var service = store.Items(context);
        var first = await service.CreateAsync(project.Id, null, null, "A");
        var second = await service.CreateAsync(project.Id, null, null, "B");
        var third = await service.CreateAsync(project.Id, null, null, "C");

        await service.MoveAsync(project.Id, null, first.Id, second.Id);
        var fourth = await service.CreateAsync(project.Id, null, null, "D");
        await using var reader = store.Open();
        var roots = await reader.TodoItems.Where(row => row.ParentItemId == null)
            .OrderBy(row => row.SortOrder).Select(row => row.Id).ToArrayAsync();

        Assert.Equal(new[] { second.Id, third.Id, fourth.Id }, roots);
        Assert.Equal(new[] { 0, 1, 2 }, await reader.TodoItems.Where(row => row.ParentItemId == null)
            .OrderBy(row => row.SortOrder).Select(row => row.SortOrder).ToArrayAsync());
    }

    [Fact]
    public async Task Indent_outdent_and_move_reconcile_completion()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var context = store.Open();
        var project = await store.Projects(context).CreateAsync("Project");
        var service = store.Items(context);
        var completed = await service.CreateAsync(project.Id, null, null, "Completed");
        var open = await service.CreateAsync(project.Id, null, null, "Open");
        await service.SetCompletedAsync(project.Id, null, completed.Id, true);

        await service.IndentAsync(project.Id, null, open.Id);
        await using (var reader = store.Open())
        {
            Assert.Null((await reader.TodoItems.SingleAsync(row => row.Id == completed.Id)).CompletedAtUtc);
        }

        await service.OutdentAsync(project.Id, null, open.Id);
        await service.SetCompletedAsync(project.Id, null, completed.Id, true);
        await service.MoveAsync(project.Id, null, open.Id, completed.Id);
        await using var finalReader = store.Open();

        Assert.Null((await finalReader.TodoItems.SingleAsync(row => row.Id == completed.Id)).CompletedAtUtc);
    }

    [Fact]
    public async Task Completion_prompts_and_blocks_persist_nothing()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var context = store.Open();
        var project = await store.Projects(context).CreateAsync("Project");
        var service = store.Items(context);
        var parent = await service.CreateAsync(project.Id, null, null, "Parent");
        var child = await service.CreateAsync(project.Id, null, parent.Id, "Child");

        Assert.IsType<CompletionResult.NeedsConfirmation>(await service.SetCompletedAsync(project.Id, null, parent.Id, true));
        await service.SetCompletedAsync(project.Id, null, child.Id, true);
        Assert.IsType<CompletionResult.Blocked>(await service.SetCompletedAsync(project.Id, null, parent.Id, false));
        await using var reader = store.Open();

        Assert.NotNull((await reader.TodoItems.SingleAsync(row => row.Id == parent.Id)).CompletedAtUtc);
        Assert.NotNull((await reader.TodoItems.SingleAsync(row => row.Id == child.Id)).CompletedAtUtc);
    }

    [Fact]
    public async Task Completing_last_child_persists_parent_completion()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(TestContext.Current.CancellationToken);
        var options = new DbContextOptionsBuilder<TaskTrackerDbContext>().UseSqlite(connection).Options;
        await using var database = new TaskTrackerDbContext(options);
        await database.Database.MigrateAsync(TestContext.Current.CancellationToken);
        var project = Project.Create("Project", TimeProvider.System);
        database.Projects.Add(project);
        await database.SaveChangesAsync(TestContext.Current.CancellationToken);
        var service = CreateService(database);
        var parent = await service.CreateAsync(project.Id, null, null, "Parent", TestContext.Current.CancellationToken);
        var child = await service.CreateAsync(project.Id, null, parent.Id, "Child", TestContext.Current.CancellationToken);

        await service.SetCompletedAsync(project.Id, null, child.Id, true, cancellationToken: TestContext.Current.CancellationToken);
        await using var reader = new TaskTrackerDbContext(options);

        var persisted = await reader.TodoItems.SingleAsync(item => item.Id == parent.Id, TestContext.Current.CancellationToken);
        Assert.NotNull(persisted.CompletedAtUtc);
    }

    [Fact]
    public async Task Area_move_carries_deleted_descendants_for_later_restore()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<TaskTrackerDbContext>().UseSqlite(connection).Options;
        await using var database = new TaskTrackerDbContext(options);
        await database.Database.MigrateAsync(cancellationToken);
        var project = Project.Create("Project", TimeProvider.System);
        var folder = Folder.Create(project.Id, null, "Area", TimeProvider.System);
        database.Projects.Add(project);
        database.Folders.Add(folder);
        await database.SaveChangesAsync(cancellationToken);
        var service = CreateService(database);
        var parent = await service.CreateAsync(project.Id, null, null, "Parent", cancellationToken);
        var child = await service.CreateAsync(project.Id, null, parent.Id, "Child", cancellationToken);
        var batchId = await service.DeleteAsync(project.Id, null, child.Id, cancellationToken);

        await service.MoveToAreaAsync(project.Id, null, folder.Id, parent.Id, cancellationToken);
        await service.RestoreAsync(project.Id, folder.Id, batchId, cancellationToken);
        await using var reader = new TaskTrackerDbContext(options);

        var restored = await reader.TodoItems.SingleAsync(item => item.Id == child.Id, cancellationToken);
        Assert.Equal(folder.Id, restored.FolderId);
        Assert.Null(restored.DeletedAtUtc);
    }

    private static ItemService CreateService(TaskTrackerDbContext database)
    {
        return new ItemService(new TestUnitOfWorkFactory(database), TimeProvider.System, TimeZoneInfo.Utc);
    }
    [Fact]
    public async Task Editing_fields_round_trips_floating_values_and_utc_timestamps()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var project = await store.Projects(writer).CreateAsync("Project");
        var item = await store.Items(writer).CreateAsync(project.Id, null, null, "Original");
        var type = await store.Lookups(writer).AddItemTypeAsync("Custom");
        var priority = await store.Lookups(writer).AddPriorityLevelAsync("Later");
        var start = new DateTime(2026, 11, 14, 9, 30, 0, DateTimeKind.Unspecified);
        var end = start.AddHours(1);

        await store.Items(writer).EditAsync(item.Id, new ItemEdit("Edited", "Description", "T-7",
            type.Id, priority.Id, new DateOnly(2026, 11, 14), new TimeOnly(17, 45), start, end));
        await using var reader = store.Open();
        var saved = await reader.TodoItems.SingleAsync();

        Assert.Equal("Edited", saved.Title);
        Assert.Equal("Description", saved.Description);
        Assert.Equal("T-7", saved.TicketNumber);
        Assert.Equal(type.Id, saved.ItemTypeId);
        Assert.Equal(priority.Id, saved.PriorityLevelId);
        Assert.Equal(new DateOnly(2026, 11, 14), saved.DueDate);
        Assert.Equal(new TimeOnly(17, 45), saved.DueTime);
        Assert.Equal(start, saved.ScheduledStart);
        Assert.Equal(end, saved.ScheduledEnd);
        Assert.Equal(DateTimeKind.Unspecified, saved.ScheduledStart!.Value.Kind);
        Assert.Equal(DateTimeKind.Utc, saved.CreatedAtUtc.Kind);
        Assert.Equal(DateTimeKind.Utc, saved.UpdatedAtUtc.Kind);
    }

    [Fact]
    public async Task Confirmed_completion_and_reopening_cascade_across_three_levels()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var project = await store.Projects(writer).CreateAsync("Project");
        var items = store.Items(writer);
        var parent = await items.CreateAsync(project.Id, null, null, "Parent");
        var child = await items.CreateAsync(project.Id, null, parent.Id, "Child");
        var grandchild = await items.CreateAsync(project.Id, null, child.Id, "Grandchild");

        var unconfirmed = await items.SetCompletedAsync(project.Id, null, parent.Id, true);
        await using var unchanged = store.Open();
        Assert.IsType<CompletionResult.NeedsConfirmation>(unconfirmed);
        Assert.Equal(0, await unchanged.TodoItems.CountAsync(row => row.CompletedAtUtc != null));
        await items.SetCompletedAsync(project.Id, null, parent.Id, true, confirmed: true);
        await using var completed = store.Open();
        Assert.Equal(3, await completed.TodoItems.CountAsync(row => row.CompletedAtUtc != null));
        Assert.Equal(DateTimeKind.Utc, (await completed.TodoItems.SingleAsync(row => row.Id == parent.Id)).CompletedAtUtc!.Value.Kind);
        var blocked = await items.SetCompletedAsync(project.Id, null, parent.Id, false);
        Assert.IsType<CompletionResult.Blocked>(blocked);
        await items.SetCompletedAsync(project.Id, null, grandchild.Id, false);
        await using var reopened = store.Open();

        Assert.Equal(0, await reopened.TodoItems.CountAsync(row => row.CompletedAtUtc != null));
    }

    [Fact]
    public async Task Delete_and_restore_child_reconcile_parent_completion()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var project = await store.Projects(writer).CreateAsync("Project");
        var items = store.Items(writer);
        var parent = await items.CreateAsync(project.Id, null, null, "Parent");
        var complete = await items.CreateAsync(project.Id, null, parent.Id, "Complete");
        var open = await items.CreateAsync(project.Id, null, parent.Id, "Open");
        await items.SetCompletedAsync(project.Id, null, complete.Id, true);

        var batch = await items.DeleteAsync(project.Id, null, open.Id);
        await using var afterDelete = store.Open();
        Assert.NotNull((await afterDelete.TodoItems.SingleAsync(row => row.Id == parent.Id)).CompletedAtUtc);
        await items.RestoreAsync(project.Id, null, batch);
        await using var afterRestore = store.Open();

        Assert.Null((await afterRestore.TodoItems.SingleAsync(row => row.Id == parent.Id)).CompletedAtUtc);
    }

    [Fact]
    public async Task Snapshot_contains_active_children_lookups_and_descendant_urgency()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var project = await store.Projects(writer).CreateAsync("Project");
        var items = store.Items(writer);
        var parent = await items.CreateAsync(project.Id, null, null, "Parent");
        var child = await items.CreateAsync(project.Id, null, parent.Id, "Child");
        await items.EditAsync(child.Id, new ItemEdit("Child", null, null, null, null,
            new DateOnly(2026, 11, 12), null, null, null));

        await using var reader = store.Open();
        var snapshot = await store.Items(reader).LoadAreaAsync(project.Id, null);
        var node = Assert.Single(snapshot.Items);

        Assert.Equal(parent.Id, node.Item.Id);
        Assert.Equal(child.Id, Assert.Single(node.Children).Item.Id);
        Assert.Equal(Urgency.Overdue, node.DisplayedUrgency.Value);
        Assert.Equal(child.Id, node.DisplayedUrgency.SourceDescendantId);
        Assert.Equal(3, snapshot.ItemTypes.Count);
        Assert.Equal(4, snapshot.PriorityLevels.Count);
    }

    [Fact]
    public async Task Move_indent_outdent_and_reorder_persist_parent_and_order()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var project = await store.Projects(writer).CreateAsync("Project");
        var items = store.Items(writer);
        var first = await items.CreateAsync(project.Id, null, null, "First");
        var second = await items.CreateAsync(project.Id, null, null, "Second");
        var third = await items.CreateAsync(project.Id, null, null, "Third");

        await items.IndentAsync(project.Id, null, second.Id);
        await using var indented = store.Open();
        Assert.Equal(first.Id, (await indented.TodoItems.SingleAsync(row => row.Id == second.Id)).ParentItemId);
        await items.OutdentAsync(project.Id, null, second.Id);
        await items.MoveAsync(project.Id, null, third.Id, first.Id);
        await items.ReorderAsync(project.Id, null, null, [second.Id, first.Id]);
        await using var reader = store.Open();
        var saved = await reader.TodoItems.ToListAsync();

        Assert.Null(saved.Single(row => row.Id == second.Id).ParentItemId);
        Assert.Equal(first.Id, saved.Single(row => row.Id == third.Id).ParentItemId);
        Assert.Equal(0, saved.Single(row => row.Id == second.Id).SortOrder);
        Assert.Equal(1, saved.Single(row => row.Id == first.Id).SortOrder);
    }
}