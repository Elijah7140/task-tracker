using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;

namespace TaskTracker.Core.Tests.Items;

public sealed class ItemTreeTests
{
    private readonly FakeTimeProvider clock = new(new DateTimeOffset(2026, 11, 13, 12, 0, 0, TimeSpan.Zero));

    private TodoItem Item(Guid projectId, Guid? folderId = null, Guid? parentId = null)
    {
        return TodoItem.Create(projectId, folderId, parentId, "Task", clock);
    }

    [Fact]
    public void Moving_root_moves_deleted_descendants_and_allows_restoration()
    {
        var projectId = Guid.NewGuid();
        var folder = Folder.Create(projectId, null, "Area", clock);
        var folders = new FolderTree(projectId, [folder]);
        var root = Item(projectId);
        var child = Item(projectId, parentId: root.Id);
        var grandchild = Item(projectId, parentId: child.Id);
        var source = new ItemTree(projectId, null, [root, child, grandchild]);
        var destination = new ItemTree(projectId, folder.Id, [], folders);
        var firstBatch = Guid.NewGuid();
        source.DeleteSubtree(child.Id, firstBatch, clock);
        var deletedAt = child.DeletedAtUtc;

        source.MoveTopLevelTo(root.Id, destination, clock);
        child.Restore(clock);
        grandchild.Restore(clock);
        destination.IncludeRestored(child);
        destination.IncludeRestored(grandchild);

        Assert.Empty(source.AllRows);
        Assert.Equal(3, destination.All.Count);
        Assert.All(destination.All, item => Assert.Equal(folder.Id, item.FolderId));
        Assert.Null(child.DeletionBatchId);
        Assert.Null(child.DeletedAtUtc);
        Assert.NotNull(deletedAt);
    }

    [Fact]
    public void Moving_root_preserves_earlier_deletion_batch()
    {
        var projectId = Guid.NewGuid();
        var folder = Folder.Create(projectId, null, "Area", clock);
        var folders = new FolderTree(projectId, [folder]);
        var root = Item(projectId);
        var child = Item(projectId, parentId: root.Id);
        var source = new ItemTree(projectId, null, [root, child]);
        var destination = new ItemTree(projectId, folder.Id, [], folders);
        var firstBatch = Guid.NewGuid();
        source.DeleteSubtree(child.Id, firstBatch, clock);
        var deletedAt = child.DeletedAtUtc;

        source.MoveTopLevelTo(root.Id, destination, clock);

        Assert.Equal(firstBatch, child.DeletionBatchId);
        Assert.Equal(deletedAt, child.DeletedAtUtc);
        Assert.Equal(folder.Id, child.FolderId);
    }

    [Fact]
    public void Deleting_parent_preserves_earlier_child_batch()
    {
        var projectId = Guid.NewGuid();
        var root = Item(projectId);
        var child = Item(projectId, parentId: root.Id);
        var tree = new ItemTree(projectId, null, [root, child]);
        var firstBatch = Guid.NewGuid();
        var secondBatch = Guid.NewGuid();
        tree.DeleteSubtree(child.Id, firstBatch, clock);

        tree.DeleteSubtree(root.Id, secondBatch, clock);

        Assert.Equal(secondBatch, root.DeletionBatchId);
        Assert.Equal(firstBatch, child.DeletionBatchId);
        Assert.Empty(tree.All);
    }

    [Fact]
    public void Reparenting_and_outdenting_within_area_succeed()
    {
        var projectId = Guid.NewGuid();
        var root = Item(projectId);
        var sibling = Item(projectId);
        var child = Item(projectId, parentId: root.Id);
        var tree = new ItemTree(projectId, null, [root, sibling, child]);

        tree.Move(child.Id, sibling.Id, clock);
        Assert.Equal(sibling.Id, child.ParentItemId);
        tree.Move(child.Id, null, clock);

        Assert.Null(child.ParentItemId);
    }

    [Fact]
    public void Invalid_moves_are_rejected()
    {
        var projectId = Guid.NewGuid();
        var root = Item(projectId);
        var child = Item(projectId, parentId: root.Id);
        var tree = new ItemTree(projectId, null, [root, child]);
        var otherProject = new ItemTree(Guid.NewGuid(), null, []);
        var folder = Folder.Create(projectId, null, "Area", clock);
        var otherArea = new ItemTree(projectId, folder.Id, [], new FolderTree(projectId, [folder]));

        Assert.Throws<TaskTracker.Core.DomainRuleException>(() => tree.Move(root.Id, root.Id, clock));
        Assert.Throws<TaskTracker.Core.DomainRuleException>(() => tree.Move(root.Id, child.Id, clock));
        Assert.Throws<TaskTracker.Core.DomainRuleException>(() => tree.MoveTopLevelTo(root.Id, otherProject, clock));
        Assert.Throws<TaskTracker.Core.DomainRuleException>(() => tree.MoveTopLevelTo(child.Id, otherArea, clock));
    }

    [Fact]
    public void Malformed_loaded_hierarchies_are_rejected()
    {
        var projectId = Guid.NewGuid();
        var root = Item(projectId);
        var missingParent = Item(projectId, parentId: Guid.NewGuid());
        var otherProject = Item(Guid.NewGuid());
        var folder = Folder.Create(projectId, null, "Area", clock);
        var otherArea = Item(projectId, folder.Id, root.Id);

        Assert.Throws<TaskTracker.Core.DomainRuleException>(() => new ItemTree(projectId, null, [missingParent]));
        Assert.Throws<TaskTracker.Core.DomainRuleException>(() => new ItemTree(projectId, null, [otherProject]));
        Assert.Throws<TaskTracker.Core.DomainRuleException>(() => new ItemTree(projectId, null, [root, otherArea]));
    }

    [Fact]
    public void Malformed_loaded_cycle_is_rejected()
    {
        var projectId = Guid.NewGuid();
        var root = Item(projectId);
        var child = Item(projectId, parentId: root.Id);
        typeof(TodoItem).GetProperty(nameof(TodoItem.ParentItemId))!.SetValue(root, child.Id);

        Assert.Throws<TaskTracker.Core.DomainRuleException>(() => new ItemTree(projectId, null, [root, child]));
    }
}