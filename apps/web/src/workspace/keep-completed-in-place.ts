import type { ItemNode, ItemSiblings } from "./item-outline.js";

/**
 * Moves finished ToDos completed in this view back into the open list at their sibling
 * position, at every level, for Auto-hide completed off (§6.2). They show checked and
 * struck through, like a completed parent with open sub-items. Tickets are never held:
 * a completed ticket leaves the open list at once.
 */
export function keepCompletedInPlace(
  siblings: ItemSiblings,
  heldIds: ReadonlySet<string>,
): ItemSiblings {
  if (heldIds.size === 0) {
    return siblings;
  }
  const isHeld = (node: ItemNode) =>
    (node.item.kind ?? "Todo") === "Todo" && heldIds.has(node.item.id);
  const held = siblings.finished
    .filter(isHeld)
    .map((node): ItemNode => ({ ...node, isFinished: false, heldCompleted: true }));
  const open = held
    .reduce(insertBySortOrder, [...siblings.open])
    .map((node) => withChildren(node, heldIds));
  const finished = siblings.finished
    .filter((node) => !isHeld(node))
    .map((node) => withChildren(node, heldIds));
  return { open, finished };
}

/** Inserts `node` before the first open sibling that sorts after it, keeping the rest in order. */
function insertBySortOrder(open: ItemNode[], node: ItemNode): ItemNode[] {
  const index = open.findIndex((sibling) => sibling.item.sortOrder > node.item.sortOrder);
  open.splice(index === -1 ? open.length : index, 0, node);
  return open;
}

function withChildren(node: ItemNode, heldIds: ReadonlySet<string>): ItemNode {
  const children = keepCompletedInPlace(node.children, heldIds);
  return children === node.children ? node : { ...node, children };
}
