#pragma warning disable xUnit1051
using TaskTracker.Core;

namespace TaskTracker.Infrastructure.Tests.Persistence;

/// <summary>Undo and redo of folder and project operations.</summary>
public sealed class FolderAndProjectUndoTests
{
    [Fact]
    public async Task Creating_a_project_undoes_and_redoes()
    {
        await using var world = await UndoWorld.CreateAsync();

        await world.VerifyRoundTripAsync(() => world.Projects.CreateAsync("Second"), "Project");
        await world.VerifyRefusalAsync("UPDATE Project SET Name = 'External' WHERE Name = 'Second'",
            redo: false, "Project");
    }

    [Fact]
    public async Task Creating_a_folder_undoes_and_redoes_without_invalidating_earlier_steps()
    {
        await using var world = await UndoWorld.CreateAsync();
        await world.Folders.CreateAsync(world.Project.Id, null, "First");

        await world.VerifyRoundTripAsync(() => world.Folders.CreateAsync(world.Project.Id, null, "Second"), "Folder");
        await world.History.UndoAsync();
        await world.History.UndoAsync();

        Assert.Empty((await world.Projects.LoadWorkspaceAsync(world.Project.Id)).Folders.Children(null));
        await world.History.RedoAsync();
        await world.History.RedoAsync();
        await world.VerifyRefusalAsync("UPDATE Folder SET Name = 'External' WHERE Name = 'Second'",
            redo: false, "Folder");
    }

    [Fact]
    public async Task Renaming_a_folder_undoes_and_redoes()
    {
        await using var world = await UndoWorld.CreateAsync();
        var folder = await world.Folders.CreateAsync(world.Project.Id, null, "Old");
        var before = await world.SnapshotAsync();
        await world.Folders.RenameAsync(world.Project.Id, folder.Id, "New");
        var after = await world.SnapshotAsync();

        await world.History.UndoAsync();

        Assert.Equal("Rename 'New'", world.Recorder.Descriptions[^1]);
        Assert.Equal(before, await world.SnapshotAsync());
        Assert.Equal("Old", (await world.ReadFolderAsync(folder.Id)).Name);

        await world.History.RedoAsync();

        Assert.Equal(after, await world.SnapshotAsync());
    }

    [Fact]
    public async Task Reordering_projects_undoes_and_redoes()
    {
        await using var world = await UndoWorld.CreateAsync();
        var second = await world.Projects.CreateAsync("Second");

        await world.VerifyRoundTripAsync(
            () => world.Projects.ReorderAsync([world.Project.Id, second.Id]), "Project");
        await world.VerifyRefusalAsync("UPDATE Project SET Name = 'External' WHERE Name = 'Second'",
            redo: false, "Project");
    }

    [Theory]
    [InlineData("project")]
    [InlineData("folder")]
    [InlineData("item")]
    public async Task Direct_restore_operations_round_trip_and_refuse_a_changed_row(string kind)
    {
        await using var world = await UndoWorld.CreateAsync();
        var project = world.Project.Id;
        var folder = await world.Folders.CreateAsync(project, null, "Folder");
        var item = await world.Items.CreateAsync(project, folder.Id, null, "Item");
        var restore = await DeleteAndGetRestoreAsync(world, folder.Id, item.Id, kind);

        await world.VerifyRoundTripAsync(restore, "Project", "Folder", "TodoItem");
        await world.VerifyRefusalAsync("UPDATE TodoItem SET Title = 'Changed' WHERE Title = 'Item'",
            redo: false, "Project", "Folder", "TodoItem");
    }

    private static async Task<Func<Task>> DeleteAndGetRestoreAsync(UndoWorld world, Guid folder, Guid item, string kind)
    {
        var project = world.Project.Id;
        switch (kind)
        {
            case "project":
                var projectBatch = await world.Projects.DeleteAsync(project);
                return () => world.Projects.RestoreAsync(projectBatch);
            case "folder":
                var folderBatch = await world.Folders.DeleteAsync(project, folder);
                return () => world.Folders.RestoreAsync(project, folderBatch);
            case "item":
                var itemBatch = await world.Items.DeleteAsync(project, folder, item);
                return () => world.Items.RestoreAsync(project, folder, itemBatch);
            default:
                throw new ArgumentOutOfRangeException(nameof(kind));
        }
    }

    [Fact]
    public async Task Renaming_a_project_undoes_and_redoes()
    {
        await using var world = await UndoWorld.CreateAsync();
        var before = await world.SnapshotAsync();
        await world.Projects.RenameAsync(world.Project.Id, "Renamed");
        var after = await world.SnapshotAsync();

        await world.History.UndoAsync();

        Assert.Equal(["Rename 'Renamed'"], world.Recorder.Descriptions);
        Assert.Equal(before, await world.SnapshotAsync());
        Assert.Equal("Project", (await world.ReadProjectAsync(world.Project.Id)).Name);

        await world.History.RedoAsync();

        Assert.Equal(after, await world.SnapshotAsync());
    }

    [Fact]
    public async Task Reordering_folders_undoes_and_redoes()
    {
        await using var world = await UndoWorld.CreateAsync();
        var first = await world.Folders.CreateAsync(world.Project.Id, null, "First");
        var second = await world.Folders.CreateAsync(world.Project.Id, null, "Second");
        var before = await world.SnapshotAsync();
        await world.Folders.ReorderAsync(world.Project.Id, null, [second.Id, first.Id]);
        var after = await world.SnapshotAsync();

        await world.History.UndoAsync();

        Assert.Equal(before, await world.SnapshotAsync());

        await world.History.RedoAsync();

        Assert.Equal(after, await world.SnapshotAsync());
    }

    [Fact]
    public async Task Deleting_a_folder_restores_the_folder_and_its_items_on_undo()
    {
        await using var world = await UndoWorld.CreateAsync();
        var folder = await world.Folders.CreateAsync(world.Project.Id, null, "Folder");
        var item = await world.Items.CreateAsync(world.Project.Id, folder.Id, null, "Inside");
        var before = await world.SnapshotAsync();
        await world.Folders.DeleteAsync(world.Project.Id, folder.Id);
        var after = await world.SnapshotAsync();

        await world.History.UndoAsync();

        Assert.Equal("Delete 'Folder'", world.Recorder.Descriptions[^1]);
        Assert.Equal(before, await world.SnapshotAsync());
        Assert.Null((await world.ReadItemAsync(item.Id)).DeletedAtUtc);

        await world.History.RedoAsync();

        Assert.Equal(after, await world.SnapshotAsync());
        Assert.NotNull((await world.ReadFolderAsync(folder.Id)).DeletedAtUtc);
    }

    [Fact]
    public async Task Deleting_a_project_restores_the_project_folders_and_items_on_undo()
    {
        await using var world = await UndoWorld.CreateAsync();
        var folder = await world.Folders.CreateAsync(world.Project.Id, null, "Folder");
        await world.Items.CreateAsync(world.Project.Id, folder.Id, null, "Inside");
        await world.Items.CreateAsync(world.Project.Id, null, null, "Top");
        var before = await world.SnapshotAsync();
        await world.Projects.DeleteAsync(world.Project.Id);
        var after = await world.SnapshotAsync();

        await world.History.UndoAsync();

        Assert.Equal("Delete 'Project'", world.Recorder.Descriptions[^1]);
        Assert.Equal(before, await world.SnapshotAsync());

        await world.History.RedoAsync();

        Assert.Equal(after, await world.SnapshotAsync());
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Undoing_trash_restore_then_delete_preserves_earlier_batches(bool deleteProject)
    {
        await using var world = await UndoWorld.CreateAsync();
        var project = world.Project.Id;
        var folder = await world.Folders.CreateAsync(project, null, "Folder");
        var old = await world.Items.CreateAsync(project, folder.Id, null, "Previously deleted");
        await world.Items.CreateAsync(project, folder.Id, null, "Live");
        var oldBatch = await world.Items.DeleteAsync(project, folder.Id, old.Id);
        var before = await world.SnapshotAsync();
        var batch = deleteProject
            ? await world.Projects.DeleteAsync(project)
            : await world.Folders.DeleteAsync(project, folder.Id);
        var deleted = await world.SnapshotAsync();
        await world.Trash.RestoreAsync(batch);
        var restored = await world.SnapshotAsync();

        await world.History.UndoAsync();
        Assert.Equal(deleted, await world.SnapshotAsync());
        await world.History.UndoAsync();
        Assert.Equal(before, await world.SnapshotAsync());
        Assert.Equal(oldBatch, (await world.ReadItemAsync(old.Id)).DeletionBatchId);

        await world.History.RedoAsync();
        Assert.Equal(deleted, await world.SnapshotAsync());
        await world.History.RedoAsync();
        Assert.Equal(restored, await world.SnapshotAsync());
    }

    [Fact]
    public async Task Redo_of_folder_deletion_refuses_items_imported_since_undo()
    {
        await using var world = await UndoWorld.CreateAsync();
        var project = world.Project.Id;
        var folder = await world.Folders.CreateAsync(project, null, "Folder");
        await world.Folders.DeleteAsync(project, folder.Id);
        await world.History.UndoAsync();
        var import = await world.Transfer.ImportCsvAsync("Title\r\nImported\r\n", project, folder.Id);
        Assert.True(import.Succeeded);
        var before = await world.SnapshotAsync();

        var error = await Assert.ThrowsAsync<DomainRuleException>(() => world.History.RedoAsync());

        Assert.Contains("new contents", error.Message, StringComparison.Ordinal);
        Assert.Equal(before, await world.SnapshotAsync());
        Assert.True(world.History.CanRedo);
    }
}