#pragma warning disable xUnit1051
namespace TaskTracker.Infrastructure.Tests.Persistence;

/// <summary>Undo and redo of folder and project operations.</summary>
public sealed class FolderAndProjectUndoTests
{
    [Fact]
    public async Task Creating_projects_and_folders_is_not_recorded()
    {
        await using var world = await UndoWorld.CreateAsync();

        await world.Folders.CreateAsync(world.Project.Id, null, "Folder");
        await world.Projects.CreateAsync("Second project");

        Assert.Empty(world.Recorder.Descriptions);
        Assert.False(world.History.CanUndo);
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

        Assert.Equal(["Rename 'New'"], world.Recorder.Descriptions);
        Assert.Equal(before, await world.SnapshotAsync());
        Assert.Equal("Old", (await world.ReadFolderAsync(folder.Id)).Name);

        await world.History.RedoAsync();

        Assert.Equal(after, await world.SnapshotAsync());
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
}