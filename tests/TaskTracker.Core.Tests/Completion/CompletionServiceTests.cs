using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Completion;
using TaskTracker.Core.Items;

namespace TaskTracker.Core.Tests.Completion;

public sealed class CompletionServiceTests
{
    private readonly FakeTimeProvider clock = new(new DateTimeOffset(2026, 11, 13, 12, 0, 0, TimeSpan.Zero));

    private DateTime Now => clock.GetUtcNow().UtcDateTime;

    private TodoItem Item(Guid projectId, Guid? parentId = null)
    {
        return TodoItem.Create(projectId, null, parentId, "Task", clock);
    }

    private static ItemTree Tree(Guid projectId, params TodoItem[] items)
    {
        return new ItemTree(projectId, null, items);
    }

    private static IReadOnlyList<CompletionChange> Applied(CompletionResult result)
    {
        return Assert.IsType<CompletionResult.Applied>(result).Changes;
    }

    [Fact]
    public void Completing_last_open_sub_item_completes_all_ancestors()
    {
        var projectId = Guid.NewGuid();
        var root = Item(projectId);
        var parent = Item(projectId, root.Id);
        var child = Item(projectId, parent.Id);
        var tree = Tree(projectId, root, parent, child);

        var changes = Applied(CompletionService.Complete(tree, child.Id, true, Now));

        Assert.Equal(3, changes.Count);
        Assert.All(changes, change => Assert.Equal(Now, change.CompletedAtUtc));
    }

    [Fact]
    public void Reopening_child_reopens_completed_ancestors()
    {
        var projectId = Guid.NewGuid();
        var root = Item(projectId);
        var child = Item(projectId, root.Id);
        root.SetCompletion(Now, clock);
        child.SetCompletion(Now, clock);

        var changes = Applied(CompletionService.Reopen(Tree(projectId, root, child), child.Id, true, Now));

        Assert.Equal(2, changes.Count);
        Assert.All(changes, change => Assert.Null(change.CompletedAtUtc));
    }

    [Fact]
    public void Adding_open_grandchild_reopens_all_ancestors()
    {
        var projectId = Guid.NewGuid();
        var root = Item(projectId);
        var parent = Item(projectId, root.Id);
        root.SetCompletion(Now, clock);
        parent.SetCompletion(Now, clock);
        var child = Item(projectId, parent.Id);

        var changes = CompletionService.AfterStructureChanged(Tree(projectId, root, parent, child), parent.Id, true, Now).Changes;

        Assert.Equal(2, changes.Count);
        Assert.All(changes, change => Assert.Null(change.CompletedAtUtc));
    }

    [Fact]
    public void Removing_open_child_completes_parent_and_grandparent()
    {
        var projectId = Guid.NewGuid();
        var root = Item(projectId);
        var parent = Item(projectId, root.Id);
        var done = Item(projectId, parent.Id);
        done.SetCompletion(Now, clock);
        var tree = Tree(projectId, root, parent, done);

        var changes = CompletionService.AfterStructureChanged(tree, parent.Id, true, Now).Changes;

        Assert.Equal(2, changes.Count);
        Assert.All(changes, change => Assert.Equal(Now, change.CompletedAtUtc));
    }

    [Fact]
    public void Removing_last_child_preserves_open_parent()
    {
        var projectId = Guid.NewGuid();
        var root = Item(projectId);

        var changes = CompletionService.AfterStructureChanged(Tree(projectId, root), root.Id, true, Now).Changes;

        Assert.Empty(changes);
    }

    [Fact]
    public void Completing_parent_with_open_descendants_requires_confirmation()
    {
        var projectId = Guid.NewGuid();
        var root = Item(projectId);
        var child = Item(projectId, root.Id);
        var grandchild = Item(projectId, child.Id);
        var tree = Tree(projectId, root, child, grandchild);

        var prompt = CompletionService.Complete(tree, root.Id, true, Now);
        var changes = Applied(CompletionService.Complete(tree, root.Id, true, Now, confirmed: true));

        Assert.Equal(2, Assert.IsType<CompletionResult.NeedsConfirmation>(prompt).OpenSubItemCount);
        Assert.Equal(3, changes.Count);
    }

    [Fact]
    public void Reopening_parent_with_complete_children_is_blocked()
    {
        var projectId = Guid.NewGuid();
        var root = Item(projectId);
        var child = Item(projectId, root.Id);
        root.SetCompletion(Now, clock);
        child.SetCompletion(Now, clock);

        var result = CompletionService.Reopen(Tree(projectId, root, child), root.Id, true, Now);

        Assert.Equal("Reopen a sub-item instead, or add a new one.", Assert.IsType<CompletionResult.Blocked>(result).Reason);
    }

    [Fact]
    public void Setting_off_keeps_completion_independent()
    {
        var projectId = Guid.NewGuid();
        var root = Item(projectId);
        var child = Item(projectId, root.Id);
        var tree = Tree(projectId, root, child);

        var completion = Applied(CompletionService.Complete(tree, root.Id, false, Now));
        var structure = CompletionService.AfterStructureChanged(tree, root.Id, false, Now).Changes;

        Assert.Equal(root.Id, Assert.Single(completion).ItemId);
        Assert.Empty(structure);
    }

    [Fact]
    public void Setting_off_reopens_only_selected_item()
    {
        var projectId = Guid.NewGuid();
        var root = Item(projectId);
        var child = Item(projectId, root.Id);
        root.SetCompletion(Now, clock);
        child.SetCompletion(Now, clock);
        var tree = Tree(projectId, root, child);

        var changes = Applied(CompletionService.Reopen(tree, child.Id, false, Now));

        Assert.Equal(child.Id, Assert.Single(changes).ItemId);
    }

    [Fact]
    public void Restoring_open_child_reopens_completed_ancestors()
    {
        var projectId = Guid.NewGuid();
        var root = Item(projectId);
        var parent = Item(projectId, root.Id);
        var child = Item(projectId, parent.Id);
        root.SetCompletion(Now, clock);
        parent.SetCompletion(Now, clock);
        child.Delete(Guid.NewGuid(), clock);
        var tree = Tree(projectId, root, parent, child);
        child.Restore(clock);
        tree.IncludeRestored(child);

        var changes = CompletionService.AfterStructureChanged(tree, parent.Id, true, Now).Changes;

        Assert.Equal(2, changes.Count);
        Assert.All(changes, change => Assert.Null(change.CompletedAtUtc));
    }

    [Fact]
    public void Moving_open_child_away_completes_old_ancestors()
    {
        var projectId = Guid.NewGuid();
        var root = Item(projectId);
        var parent = Item(projectId, root.Id);
        var completedSibling = Item(projectId, parent.Id);
        var openChild = Item(projectId, parent.Id);
        completedSibling.SetCompletion(Now, clock);
        var tree = Tree(projectId, root, parent, completedSibling, openChild);
        tree.Move(openChild.Id, null, clock);

        var changes = CompletionService.AfterStructureChanged(tree, parent.Id, true, Now).Changes;

        Assert.Equal(2, changes.Count);
        Assert.All(changes, change => Assert.Equal(Now, change.CompletedAtUtc));
    }

    [Fact]
    public void Deleting_open_child_completes_parent_with_completed_sibling()
    {
        var projectId = Guid.NewGuid();
        var root = Item(projectId);
        var completedChild = Item(projectId, root.Id);
        var openChild = Item(projectId, root.Id);
        completedChild.SetCompletion(Now, clock);
        var tree = Tree(projectId, root, completedChild, openChild);
        tree.DeleteSubtree(openChild.Id, Guid.NewGuid(), clock);

        var changes = CompletionService.AfterStructureChanged(tree, root.Id, true, Now).Changes;

        Assert.Equal(root.Id, Assert.Single(changes).ItemId);
    }

    [Fact]
    public void Moving_open_child_in_reopens_new_parent()
    {
        var projectId = Guid.NewGuid();
        var source = Item(projectId);
        var destination = Item(projectId);
        var child = Item(projectId, source.Id);
        destination.SetCompletion(Now, clock);
        var tree = Tree(projectId, source, destination, child);
        tree.Move(child.Id, destination.Id, clock);

        var changes = CompletionService.AfterStructureChanged(tree, destination.Id, true, Now).Changes;

        Assert.Equal(destination.Id, Assert.Single(changes).ItemId);
        Assert.Null(changes[0].CompletedAtUtc);
    }

    [Fact]
    public void Reconciliation_counts_multi_level_changes_and_preserves_timestamps()
    {
        var projectId = Guid.NewGuid();
        var root = Item(projectId);
        var parent = Item(projectId, root.Id);
        var child = Item(projectId, parent.Id);
        var earlier = Now.AddDays(-1);
        child.SetCompletion(earlier, clock);
        var openRoot = Item(projectId);
        var openChild = Item(projectId, openRoot.Id);
        openRoot.SetCompletion(earlier, clock);
        var tree = Tree(projectId, root, parent, child, openRoot, openChild);

        var preview = CompletionService.PreviewReconciliation(tree, Now);
        var changes = CompletionService.ReconcileAll(tree, Now).Changes;

        Assert.Equal(new ReconciliationPreview(2, 1), preview);
        Assert.DoesNotContain(changes, change => change.ItemId == child.Id);
    }

    [Fact]
    public void Finished_requires_every_active_descendant_to_be_complete()
    {
        var projectId = Guid.NewGuid();
        var root = Item(projectId);
        var child = Item(projectId, root.Id);
        var grandchild = Item(projectId, child.Id);
        child.SetCompletion(Now, clock);
        grandchild.SetCompletion(Now, clock);
        var tree = Tree(projectId, root, child, grandchild);

        var openRootFinished = CompletionService.IsFinished(tree, root.Id);
        root.SetCompletion(Now, clock);
        grandchild.SetCompletion(null, clock);
        var openGrandchildFinished = CompletionService.IsFinished(tree, root.Id);
        grandchild.Delete(Guid.NewGuid(), clock);
        var deletedGrandchildFinished = CompletionService.IsFinished(tree, root.Id);

        Assert.False(openRootFinished);
        Assert.False(openGrandchildFinished);
        Assert.True(deletedGrandchildFinished);
    }
}