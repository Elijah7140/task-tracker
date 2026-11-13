using TaskTracker.Core.Items;

#pragma warning disable xUnit1051
using Microsoft.EntityFrameworkCore;

namespace TaskTracker.Infrastructure.Tests.Persistence;

public sealed class ProjectServiceTests
{
    [Fact]
    public async Task Restoring_project_reconciles_completed_parent_with_open_child()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var context = store.Open();
        var project = await store.Projects(context).CreateAsync("Project");
        var settings = store.Settings(context);
        await settings.SetGlobalAsync(TaskTracker.Core.Settings.SettingsCatalogue.AutoCompleteParents, false);
        var parent = await store.Items(context).CreateAsync(project.Id, null, null, "Parent");
        await store.Items(context).CreateAsync(project.Id, null, parent.Id, "Open child");
        await store.Items(context).SetCompletedAsync(project.Id, null, parent.Id, true);
        var batch = await store.Projects(context).DeleteAsync(project.Id);
        await settings.SetGlobalAsync(TaskTracker.Core.Settings.SettingsCatalogue.AutoCompleteParents, true, confirmed: true);

        await store.Projects(context).RestoreAsync(batch);
        await using var reader = store.Open();

        Assert.Null((await reader.TodoItems.SingleAsync(row => row.Id == parent.Id)).CompletedAtUtc);
    }

    [Fact]
    public async Task Create_rename_and_reorder_are_visible_to_a_new_service()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var service = store.Projects(writer);
        var first = await service.CreateAsync("First");
        var second = await service.CreateAsync("Second");

        await service.RenameAsync(first.Id, "Renamed");
        await service.ReorderAsync([second.Id, first.Id]);
        await using var reader = store.Open();
        var projects = await store.Projects(reader).ListAsync();

        Assert.Equal([second.Id, first.Id], projects.Select(summary => summary.Project.Id));
        Assert.Equal("Renamed", projects[1].Project.Name);
    }

    [Fact]
    public async Task Deleting_project_stamps_its_folders_and_items_in_one_batch_and_restore_reverses_it()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var project = await store.Projects(writer).CreateAsync("Project");
        var folder = await store.Folders(writer).CreateAsync(project.Id, null, "Folder");
        var item = await store.Items(writer).CreateAsync(project.Id, folder.Id, null, "Item");

        var batch = await store.Projects(writer).DeleteAsync(project.Id);
        await using var deleted = store.Open();
        Assert.Empty(await deleted.Projects.ToListAsync());
        Assert.Empty(await deleted.Folders.ToListAsync());
        Assert.Empty(await deleted.TodoItems.ToListAsync());
        Assert.Equal(batch, (await deleted.Projects.IgnoreQueryFilters().SingleAsync()).DeletionBatchId);
        Assert.Equal(batch, (await deleted.Folders.IgnoreQueryFilters().SingleAsync()).DeletionBatchId);
        Assert.Equal(batch, (await deleted.TodoItems.IgnoreQueryFilters().SingleAsync()).DeletionBatchId);

        await store.Projects(writer).RestoreAsync(batch);
        await using var restored = store.Open();
        Assert.NotNull(await restored.Projects.SingleOrDefaultAsync(row => row.Id == project.Id));
        Assert.NotNull(await restored.Folders.SingleOrDefaultAsync(row => row.Id == folder.Id));
        Assert.NotNull(await restored.TodoItems.SingleOrDefaultAsync(row => row.Id == item.Id));
    }

    [Fact]
    public async Task Listing_projects_counts_open_and_overdue_items()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var writer = store.Open();
        var project = await store.Projects(writer).CreateAsync("Project");
        var overdue = await store.Items(writer).CreateAsync(project.Id, null, null, "Overdue");
        await store.Items(writer).EditAsync(overdue.Id, new ItemEdit("Overdue", null, null,
            null, null, new DateOnly(2026, 11, 12), null, null, null));
        var finished = await store.Items(writer).CreateAsync(project.Id, null, null, "Finished");
        await store.Items(writer).SetCompletedAsync(project.Id, null, finished.Id, true);

        await using var reader = store.Open();
        var summary = Assert.Single(await store.Projects(reader).ListAsync());

        Assert.Equal(1, summary.OpenCount);
        Assert.Equal(1, summary.OverdueCount);
    }
}