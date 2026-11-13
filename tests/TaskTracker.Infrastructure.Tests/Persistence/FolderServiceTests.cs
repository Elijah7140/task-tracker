#pragma warning disable xUnit1051
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Projects;
using TaskTracker.Infrastructure.Persistence;

namespace TaskTracker.Infrastructure.Tests.Persistence;

public sealed class FolderServiceTests
{
    [Fact]
    public async Task Moving_folder_out_and_creating_another_keeps_contiguous_order()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var context = store.Open();
        var project = await store.Projects(context).CreateAsync("Project");
        var service = store.Folders(context);
        var first = await service.CreateAsync(project.Id, null, "A");
        var second = await service.CreateAsync(project.Id, null, "B");
        var third = await service.CreateAsync(project.Id, null, "C");

        await service.MoveAsync(project.Id, first.Id, second.Id);
        var fourth = await service.CreateAsync(project.Id, null, "D");
        await using var reader = store.Open();
        var roots = await reader.Folders.Where(row => row.ParentFolderId == null)
            .OrderBy(row => row.SortOrder).Select(row => row.Id).ToArrayAsync();
        var orders = await reader.Folders.Where(row => row.ParentFolderId == null)
            .OrderBy(row => row.SortOrder).Select(row => row.SortOrder).ToArrayAsync();

        Assert.Equal(new[] { second.Id, third.Id, fourth.Id }, roots);
        Assert.Equal(new[] { 0, 1, 2 }, orders);
    }

    [Fact]
    public async Task Restoring_folder_reopens_completed_parent_with_open_child()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var context = store.Open();
        var project = await store.Projects(context).CreateAsync("Project");
        var folder = await store.Folders(context).CreateAsync(project.Id, null, "Area");
        var settings = store.Settings(context);
        await settings.SetGlobalAsync(TaskTracker.Core.Settings.SettingsCatalogue.AutoCompleteParents, false);
        var parent = await store.Items(context).CreateAsync(project.Id, folder.Id, null, "Parent");
        await store.Items(context).CreateAsync(project.Id, folder.Id, parent.Id, "Open child");
        await store.Items(context).SetCompletedAsync(project.Id, folder.Id, parent.Id, true);
        var batch = await store.Folders(context).DeleteAsync(project.Id, folder.Id);
        await settings.SetGlobalAsync(TaskTracker.Core.Settings.SettingsCatalogue.AutoCompleteParents, true, confirmed: true);

        await store.Folders(context).RestoreAsync(project.Id, batch);
        await using var reader = store.Open();

        Assert.Null((await reader.TodoItems.SingleAsync(row => row.Id == parent.Id)).CompletedAtUtc);
    }

    [Fact]
    public async Task Earlier_deletion_batch_stays_deleted_after_parent_restore()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        var options = new DbContextOptionsBuilder<TaskTrackerDbContext>().UseSqlite(connection).Options;
        await using var database = new TaskTrackerDbContext(options);
        await database.Database.MigrateAsync(cancellationToken);
        var project = Project.Create("Project", TimeProvider.System);
        database.Projects.Add(project);
        await database.SaveChangesAsync(cancellationToken);
        var service = new FolderService(new TestUnitOfWorkFactory(database), TimeProvider.System);
        var parent = await service.CreateAsync(project.Id, null, "Parent", cancellationToken);
        var child = await service.CreateAsync(project.Id, parent.Id, "Child", cancellationToken);
        var childBatch = await service.DeleteAsync(project.Id, child.Id, cancellationToken);
        var parentBatch = await service.DeleteAsync(project.Id, parent.Id, cancellationToken);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.RestoreAsync(project.Id, childBatch, cancellationToken));
        await service.RestoreAsync(project.Id, parentBatch, cancellationToken);
        await using var reader = new TaskTrackerDbContext(options);

        Assert.NotNull((await reader.Folders.IgnoreQueryFilters()
            .SingleAsync(folder => folder.Id == child.Id, cancellationToken)).DeletedAtUtc);
        Assert.Null((await reader.Folders.IgnoreQueryFilters()
            .SingleAsync(folder => folder.Id == parent.Id, cancellationToken)).DeletedAtUtc);
    }
    [Fact]
    public async Task Create_rename_move_and_reorder_persist_with_rejected_cycles_and_cross_project_moves()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var projects = store.Projects(writer);
        var firstProject = await projects.CreateAsync("First");
        var secondProject = await projects.CreateAsync("Second");
        var folders = store.Folders(writer);
        var first = await folders.CreateAsync(firstProject.Id, null, "First");
        var second = await folders.CreateAsync(firstProject.Id, null, "Second");
        var child = await folders.CreateAsync(firstProject.Id, first.Id, "Child");
        var foreign = await folders.CreateAsync(secondProject.Id, null, "Foreign");

        await Assert.ThrowsAsync<InvalidOperationException>(() => folders.MoveAsync(firstProject.Id, first.Id, child.Id));
        await Assert.ThrowsAsync<InvalidOperationException>(() => folders.MoveAsync(firstProject.Id, first.Id, foreign.Id));
        await folders.RenameAsync(firstProject.Id, child.Id, "Renamed");
        await folders.MoveAsync(firstProject.Id, child.Id, second.Id);
        await folders.ReorderAsync(firstProject.Id, null, [second.Id, first.Id]);
        await using var reader = store.Open();
        var saved = await reader.Folders.ToListAsync();

        Assert.Equal(second.Id, saved.Single(row => row.Id == child.Id).ParentFolderId);
        Assert.Equal("Renamed", saved.Single(row => row.Id == child.Id).Name);
        Assert.Equal(0, saved.Single(row => row.Id == second.Id).SortOrder);
    }

    [Fact]
    public async Task Deleting_folder_stamps_subtree_and_items_in_one_batch_then_restores_them()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var project = await store.Projects(writer).CreateAsync("Project");
        var folders = store.Folders(writer);
        var parent = await folders.CreateAsync(project.Id, null, "Parent");
        var child = await folders.CreateAsync(project.Id, parent.Id, "Child");
        var item = await store.Items(writer).CreateAsync(project.Id, child.Id, null, "Item");

        var batch = await folders.DeleteAsync(project.Id, parent.Id);
        await using var deleted = store.Open();
        Assert.Equal(2, await deleted.Folders.IgnoreQueryFilters().CountAsync(row => row.DeletionBatchId == batch));
        Assert.Equal(batch, (await deleted.TodoItems.IgnoreQueryFilters().SingleAsync()).DeletionBatchId);
        await folders.RestoreAsync(project.Id, batch);
        await using var restored = store.Open();

        Assert.Equal(2, await restored.Folders.CountAsync());
        Assert.NotNull(await restored.TodoItems.SingleOrDefaultAsync(row => row.Id == item.Id));
    }
}