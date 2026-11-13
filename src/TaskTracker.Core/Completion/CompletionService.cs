using TaskTracker.Core.Items;

namespace TaskTracker.Core.Completion;

/// <summary>Proposes completion changes without mutating items or storing data.</summary>
public static class CompletionService
{
    /// <summary>Completes an item and, when enabled, its open descendants.</summary>
    public static CompletionResult Complete(ItemTree tree, Guid itemId, bool autoComplete, DateTime nowUtc, bool confirmed = false)
    {
        ValidateUtc(nowUtc);
        var target = tree.Get(itemId);
        var descendants = tree.Descendants(itemId);
        var openCount = descendants.Count(item => item.CompletedAtUtc is null);

        if (autoComplete && openCount > 0 && !confirmed)
        {
            return new CompletionResult.NeedsConfirmation(openCount);
        }

        var proposed = CurrentStates(tree);
        proposed[target.Id] ??= nowUtc;

        if (autoComplete)
        {
            foreach (var descendant in descendants)
            {
                proposed[descendant.Id] ??= nowUtc;
            }

            ReconcileAncestors(tree, target.Id, proposed, nowUtc);
        }

        return Changes(tree, proposed);
    }

    /// <summary>Reopens an item and, when enabled, its ancestors.</summary>
    public static CompletionResult Reopen(ItemTree tree, Guid itemId, bool autoComplete, DateTime nowUtc)
    {
        ValidateUtc(nowUtc);
        tree.Get(itemId);
        var proposed = CurrentStates(tree);

        if (autoComplete && tree.Children(itemId).Count > 0 &&
            tree.Children(itemId).All(child => proposed[child.Id] is not null))
        {
            return new CompletionResult.Blocked("Reopen a sub-item instead, or add a new one.");
        }

        proposed[itemId] = null;

        if (autoComplete)
        {
            ReconcileAncestors(tree, itemId, proposed, nowUtc);
        }

        return Changes(tree, proposed);
    }

    /// <summary>Re-evaluates an affected parent and its ancestors after an add, delete, restore, or move.</summary>
    public static CompletionResult.Applied AfterStructureChanged(ItemTree tree, Guid? affectedParentId, bool autoComplete, DateTime nowUtc)
    {
        ValidateUtc(nowUtc);
        var proposed = CurrentStates(tree);

        if (autoComplete && affectedParentId is Guid parentId)
        {
            ReconcileParent(tree, tree.Get(parentId), proposed, nowUtc);
            ReconcileAncestors(tree, parentId, proposed, nowUtc);
        }

        return Changes(tree, proposed);
    }

    /// <summary>Proposes every parent change required to enable automatic completion.</summary>
    public static CompletionResult.Applied ReconcileAll(ItemTree tree, DateTime nowUtc)
    {
        ValidateUtc(nowUtc);
        var proposed = CurrentStates(tree);

        foreach (var root in tree.Children(null))
        {
            ReconcileSubtree(tree, root, proposed, nowUtc);
        }

        return Changes(tree, proposed);
    }

    /// <summary>Counts parent transitions without changing the tree.</summary>
    public static ReconciliationPreview PreviewReconciliation(ItemTree tree, DateTime nowUtc)
    {
        var changes = ReconcileAll(tree, nowUtc).Changes;

        return new ReconciliationPreview(
            changes.Count(change => change.CompletedAtUtc is not null),
            changes.Count(change => change.CompletedAtUtc is null));
    }

    /// <summary>True when an item and every active descendant are complete.</summary>
    public static bool IsFinished(ItemTree tree, Guid itemId)
    {
        return tree.Get(itemId).CompletedAtUtc is not null &&
            tree.Descendants(itemId).All(item => item.CompletedAtUtc is not null);
    }

    private static Dictionary<Guid, DateTime?> CurrentStates(ItemTree tree)
    {
        return tree.All.ToDictionary(item => item.Id, item => item.CompletedAtUtc);
    }

    private static CompletionResult.Applied Changes(ItemTree tree, Dictionary<Guid, DateTime?> proposed)
    {
        var changes = tree.All
            .Where(item => proposed[item.Id] != item.CompletedAtUtc)
            .Select(item => new CompletionChange(item.Id, proposed[item.Id]))
            .ToArray();

        return new CompletionResult.Applied(changes);
    }

    private static void ReconcileAncestors(ItemTree tree, Guid itemId, Dictionary<Guid, DateTime?> proposed, DateTime nowUtc)
    {
        foreach (var ancestor in tree.Ancestors(itemId))
        {
            ReconcileParent(tree, ancestor, proposed, nowUtc);
        }
    }

    private static void ReconcileSubtree(ItemTree tree, TodoItem item, Dictionary<Guid, DateTime?> proposed, DateTime nowUtc)
    {
        foreach (var child in tree.Children(item.Id))
        {
            ReconcileSubtree(tree, child, proposed, nowUtc);
        }

        ReconcileParent(tree, item, proposed, nowUtc);
    }

    private static void ReconcileParent(ItemTree tree, TodoItem parent, Dictionary<Guid, DateTime?> proposed, DateTime nowUtc)
    {
        var children = tree.Children(parent.Id);

        if (children.Count == 0)
        {
            return;
        }

        proposed[parent.Id] = children.All(child => proposed[child.Id] is not null)
            ? proposed[parent.Id] ?? nowUtc
            : null;
    }

    private static void ValidateUtc(DateTime nowUtc)
    {
        if (nowUtc.Kind != DateTimeKind.Utc)
        {
            throw new ArgumentException("Completion time must be UTC.", nameof(nowUtc));
        }
    }
}