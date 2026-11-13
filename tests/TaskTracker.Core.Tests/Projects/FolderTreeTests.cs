using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Projects;

namespace TaskTracker.Core.Tests.Projects;

public sealed class FolderTreeTests
{
    private readonly FakeTimeProvider clock = new(new DateTimeOffset(2026, 11, 13, 12, 0, 0, TimeSpan.Zero));

    [Fact]
    public void Moving_folder_into_descendant_is_rejected()
    {
        var projectId = Guid.NewGuid();
        var root = Folder.Create(projectId, null, "Root", clock);
        var child = Folder.Create(projectId, root.Id, "Child", clock);
        var tree = new FolderTree(projectId, [root, child]);

        Assert.Throws<InvalidOperationException>(() => tree.Move(root.Id, child.Id, clock));
    }

    [Fact]
    public void Deleting_folder_stamps_active_subtree()
    {
        var projectId = Guid.NewGuid();
        var root = Folder.Create(projectId, null, "Root", clock);
        var child = Folder.Create(projectId, root.Id, "Child", clock);
        var tree = new FolderTree(projectId, [root, child]);
        var batchId = Guid.NewGuid();

        tree.DeleteSubtree(root.Id, batchId, clock);

        Assert.Equal(batchId, root.DeletionBatchId);
        Assert.Equal(batchId, child.DeletionBatchId);
        Assert.Empty(tree.Children(null));
    }

    [Fact]
    public void Deleting_parent_preserves_earlier_child_batch()
    {
        var projectId = Guid.NewGuid();
        var root = Folder.Create(projectId, null, "Root", clock);
        var child = Folder.Create(projectId, root.Id, "Child", clock);
        var tree = new FolderTree(projectId, [root, child]);
        var firstBatch = Guid.NewGuid();
        var secondBatch = Guid.NewGuid();
        tree.DeleteSubtree(child.Id, firstBatch, clock);

        tree.DeleteSubtree(root.Id, secondBatch, clock);

        Assert.Equal(firstBatch, child.DeletionBatchId);
        Assert.Equal(secondBatch, root.DeletionBatchId);
    }

    [Fact]
    public void Restoring_folder_clears_both_deletion_fields()
    {
        var folder = Folder.Create(Guid.NewGuid(), null, "Area", clock);
        folder.Delete(Guid.NewGuid(), clock);

        folder.Restore(clock);

        Assert.Null(folder.DeletedAtUtc);
        Assert.Null(folder.DeletionBatchId);
    }
}