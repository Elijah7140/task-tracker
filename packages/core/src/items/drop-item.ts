import { isFinished } from "../completion/completion-service.js";
import { HierarchyError } from "../hierarchy/hierarchy-error.js";
import type { ItemTree } from "./item-tree.js";

function insertRelative(ids: string[], itemId: string, targetId: string, after: boolean) {
  const index = ids.indexOf(targetId);
  ids.splice(index + Number(after), 0, itemId);
  return ids;
}

function moveAtEdge(
  tree: ItemTree,
  itemId: string,
  targetId: string,
  after: boolean,
  now: Temporal.Instant,
) {
  const { parentItemId } = tree.get(targetId);
  const siblings = tree.children(parentItemId);
  if (tree.get(itemId).parentItemId !== parentItemId) {
    const index = siblings.findIndex((sibling) => sibling.id === targetId);
    tree.moveAt(itemId, parentItemId, index + Number(after), now);
    return;
  }
  // Like legacy MoveAt, insert into the full persisted sibling list, finished rows included.
  const otherIds = siblings.map(({ id }) => id).filter((id) => id !== itemId);
  tree.reorder(parentItemId, insertRelative(otherIds, itemId, targetId, after), now);
}

/** Move a subtree relative to a live target, using completion and hierarchy from the same tree. */
export function dropItem(
  tree: ItemTree,
  itemId: string,
  targetId: string,
  position: "before" | "after" | "into",
  now: Temporal.Instant,
): void {
  if (targetId === itemId || tree.ancestors(targetId).some(({ id }) => id === itemId)) {
    throw new HierarchyError("Item move would create a cycle.");
  }
  if (position === "into") {
    tree.move(itemId, targetId, now);
    return;
  }
  if (isFinished(tree, itemId) || isFinished(tree, targetId)) {
    throw new HierarchyError("Finished items only accept drops into another item.");
  }
  moveAtEdge(tree, itemId, targetId, position === "after", now);
}
