import type { ItemTree } from "../items/item-tree.js";
import type { TodoItem } from "../items/todo-item.js";
import type { AppliedCompletion, CompletionResult } from "./completion-result.js";
import type { ReconciliationPreview } from "./reconciliation-preview.js";
import { type OccurrenceContext, RecurringCompletion } from "./recurring-completion.js";

/**
 * Propose completion. An approval must match the current set of open descendants.
 * With `recurrence`, completed repeating items add their next occurrences to the
 * tree before parents are re-evaluated (§7.11).
 */
export function complete(
  tree: ItemTree,
  itemId: string,
  autoComplete: boolean,
  now: Temporal.Instant,
  confirmedOpenItemIds?: readonly string[],
  recurrence?: OccurrenceContext,
): CompletionResult {
  tree.get(itemId);
  const openDescendants = autoComplete
    ? tree.descendants(itemId).filter((row) => row.completedAtUtc === null)
    : [];
  const openSubItemIds = openDescendants.map((row) => row.id);
  if (needsConfirmation(openSubItemIds, confirmedOpenItemIds)) {
    return { kind: "needs-confirmation", openSubItemCount: openSubItemIds.length, openSubItemIds };
  }
  if (recurrence !== undefined) {
    return completeRecurring(tree, itemId, autoComplete, now, recurrence);
  }

  const proposed = currentStates(tree);
  proposed.set(itemId, proposed.get(itemId) ?? now);
  for (const descendant of openDescendants) {
    proposed.set(descendant.id, now);
  }
  if (autoComplete) {
    reconcileParents(tree, tree.ancestors(itemId), proposed, now);
  }
  return changes(tree, proposed);
}

function completeRecurring(
  tree: ItemTree,
  itemId: string,
  autoComplete: boolean,
  now: Temporal.Instant,
  recurrence: OccurrenceContext,
): AppliedCompletion {
  const completion = new RecurringCompletion(tree, now, recurrence);
  if (!autoComplete) {
    completion.completeItem(itemId);
    return completion.result();
  }
  completion.completeBranch(itemId);
  completion.reconcile(tree.ancestors(itemId));
  return completion.result();
}

/** Propose reopening. Automatic completion blocks reopening a parent whose children are all complete. */
export function reopen(
  tree: ItemTree,
  itemId: string,
  autoComplete: boolean,
  now: Temporal.Instant,
): CompletionResult {
  tree.get(itemId);
  const children = tree.children(itemId);
  if (autoComplete && children.length > 0 && children.every((row) => row.completedAtUtc !== null)) {
    return { kind: "blocked", reason: "Reopen a sub-item instead, or add a new one." };
  }

  const proposed = currentStates(tree);
  proposed.set(itemId, null);
  if (autoComplete) {
    reconcileParents(tree, tree.ancestors(itemId), proposed, now);
  }
  return changes(tree, proposed);
}

/**
 * Reconcile the affected parents and ancestors together after a structural change.
 * With `recurrence`, a repeating parent that completes creates its next occurrence.
 */
export function afterStructureChanged(
  tree: ItemTree,
  affectedParentIds: readonly (string | null)[],
  autoComplete: boolean,
  now: Temporal.Instant,
  recurrence?: OccurrenceContext,
): AppliedCompletion {
  if (!autoComplete) {
    return { kind: "applied", changes: [] };
  }

  const affected = new Set<string>();
  for (const parentId of affectedParentIds) {
    if (parentId !== null) {
      affected.add(parentId);
      for (const ancestor of tree.ancestors(parentId)) {
        affected.add(ancestor.id);
      }
    }
  }
  const bottomUp = tree
    .descendants(null)
    .toReversed()
    .filter((row) => affected.has(row.id));
  if (recurrence !== undefined) {
    const completion = new RecurringCompletion(tree, now, recurrence);
    completion.reconcile(bottomUp);
    return completion.result();
  }
  const proposed = currentStates(tree);
  reconcileParents(tree, bottomUp, proposed, now);
  return changes(tree, proposed);
}

/** Propose all parent changes needed when enabling automatic completion. */
export function reconcileAll(tree: ItemTree, now: Temporal.Instant): AppliedCompletion {
  const proposed = currentStates(tree);
  reconcileParents(tree, tree.descendants(null).toReversed(), proposed, now);
  return changes(tree, proposed);
}

/** Preview the parent transitions without updating the tree. */
export function previewReconciliation(
  tree: ItemTree,
  now: Temporal.Instant,
): ReconciliationPreview {
  const { changes } = reconcileAll(tree, now);
  const parentsToComplete = changes.filter((change) => change.completedAtUtc !== null).length;
  return { parentsToComplete, parentsToReopen: changes.length - parentsToComplete };
}

/** A branch is finished when the item and all its active descendants are complete. */
export function isFinished(tree: ItemTree, itemId: string): boolean {
  return (
    tree.get(itemId).completedAtUtc !== null &&
    tree.descendants(itemId).every((row) => row.completedAtUtc !== null)
  );
}

/** Group active siblings, preserving open order and sorting finished work newest first. */
export function partitionSiblings(
  tree: ItemTree,
  parentId: string | null,
): { readonly open: readonly TodoItem[]; readonly finished: readonly TodoItem[] } {
  const open: TodoItem[] = [];
  const finished: { row: TodoItem; completedAtUtc: Temporal.Instant }[] = [];
  for (const row of tree.children(parentId)) {
    if (row.completedAtUtc !== null && isFinished(tree, row.id)) {
      finished.push({ row, completedAtUtc: row.completedAtUtc });
    } else {
      open.push(row);
    }
  }

  finished.sort((left, right) =>
    Temporal.Instant.compare(right.completedAtUtc, left.completedAtUtc),
  );
  return { open, finished: finished.map((entry) => entry.row) };
}

type CompletionStates = Map<string, Temporal.Instant | null>;

function needsConfirmation(openIds: readonly string[], confirmedIds?: readonly string[]): boolean {
  if (openIds.length === 0) {
    return false;
  }
  if (confirmedIds === undefined) {
    return true;
  }
  const confirmed = new Set(confirmedIds);
  return confirmedIds.length !== openIds.length || openIds.some((id) => !confirmed.has(id));
}

function currentStates(tree: ItemTree): CompletionStates {
  return new Map(tree.all.map((row) => [row.id, row.completedAtUtc]));
}

/**
 * Groups active items by parent once, so reconciling a wide tree stays linear
 * instead of scanning every item for each parent.
 */
function childrenByParent(tree: ItemTree): Map<string | null, TodoItem[]> {
  return Map.groupBy(tree.all, (row) => row.parentItemId);
}

function reconcileParents(
  tree: ItemTree,
  bottomUp: readonly TodoItem[],
  proposed: CompletionStates,
  now: Temporal.Instant,
): void {
  const byParent = childrenByParent(tree);
  for (const parent of bottomUp) {
    const children = byParent.get(parent.id) ?? [];
    if (children.length === 0) {
      continue;
    }

    const allComplete = children.every((child) => Boolean(proposed.get(child.id)));
    proposed.set(parent.id, allComplete ? (proposed.get(parent.id) ?? now) : null);
  }
}

function changes(tree: ItemTree, proposed: CompletionStates): AppliedCompletion {
  const changes = tree.all.flatMap((row) => {
    const completedAtUtc = proposed.get(row.id) ?? null;
    return completedAtUtc === row.completedAtUtc ? [] : [{ itemId: row.id, completedAtUtc }];
  });
  return { kind: "applied", changes };
}
