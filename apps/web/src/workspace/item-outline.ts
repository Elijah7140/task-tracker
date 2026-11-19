import type { AreaSnapshot } from "@task-tracker/contracts";

/**
 * One level of the item tree as the server projects it: open items in sibling
 * order, then finished branches newest-completed first (§6.2).
 */
export type ItemSiblings = (typeof AreaSnapshot.Type)["items"];

/** One item with its server-computed urgency, finished flag and sub-items. */
export type ItemNode = ItemSiblings["open"][number];

/** A level with no items, used before the area loads. */
export const EMPTY_SIBLINGS: ItemSiblings = { open: [], finished: [] };

/** Focus request issued after a tree mutation updates or remounts a row. */
export interface ItemFocusRequest {
  readonly id: string;
  /** Waits until the item sits under this parent (`null` for top level). */
  readonly expectedParentId?: string | null | undefined;
  /** Waits until a snapshot other than this one arrives. */
  readonly afterNodes?: ItemSiblings | undefined;
  /**
   * Set when the item may leave the open list, as after completing, deleting or
   * moving it. `id` is then focused only while it is an open row; otherwise the
   * first of these rows that is rendered, and quick-add when none is.
   */
  readonly fallbackIds?: ReadonlyArray<string> | undefined;
}

/** Every item in a level, open items first and then finished branches. */
export function allSiblings(siblings: ItemSiblings): ReadonlyArray<ItemNode> {
  return [...siblings.open, ...siblings.finished];
}

/** Whether a level holds no items at all. */
export function isEmptyLevel(siblings: ItemSiblings): boolean {
  return siblings.open.length === 0 && siblings.finished.length === 0;
}

/**
 * Item IDs of a level in persisted sibling order, which ReorderItems requires so
 * finished siblings keep their slots and reopen where they were (§6.2).
 */
export function persistedSiblingOrder(siblings: ItemSiblings): ReadonlyArray<string> {
  return allSiblings(siblings)
    .toSorted((left, right) => left.item.sortOrder - right.item.sortOrder)
    .map((node) => node.item.id);
}

/** Finds an item node anywhere in the tree by ID. */
export function findItemNode(nodes: ItemSiblings, itemId: string): ItemNode | undefined {
  for (const node of allSiblings(nodes)) {
    if (node.item.id === itemId) {
      return node;
    }
    const nested = findItemNode(node.children, itemId);
    if (nested !== undefined) {
      return nested;
    }
  }
  return undefined;
}

/** Finds an item's title anywhere in the tree, for urgency attribution. */
export function findItemTitle(nodes: ItemSiblings, itemId: string): string | undefined {
  return findItemNode(nodes, itemId)?.item.title;
}

/** Returns ancestor IDs from the top-level item down to the direct parent of `itemId`. */
export function itemAncestorIds(nodes: ItemSiblings, itemId: string): ReadonlyArray<string> {
  const path: Array<string> = [];
  let current = findItemNode(nodes, itemId);
  while (current !== undefined && current.item.parentItemId !== null) {
    path.unshift(current.item.parentItemId);
    current = findItemNode(nodes, current.item.parentItemId);
  }
  return path;
}

/** Returns the level under `parentItemId` (`null` selects root items). */
export function siblingNodesOf(nodes: ItemSiblings, parentItemId: string | null): ItemSiblings {
  if (parentItemId === null) {
    return nodes;
  }
  return findItemNode(nodes, parentItemId)?.children ?? EMPTY_SIBLINGS;
}

/** Lists every item in depth-first display order with its depth, for parent pickers. */
export function flattenItemNodes(
  nodes: ItemSiblings,
  depth = 0,
): ReadonlyArray<{ readonly node: ItemNode; readonly depth: number }> {
  return allSiblings(nodes).flatMap((node) => [
    { node, depth },
    ...flattenItemNodes(node.children, depth + 1),
  ]);
}

/**
 * Finds the visible open sibling immediately before `node`, skipping finished
 * siblings so Notion-style indent never moves work into a hidden Completed branch.
 */
export function precedingOpenSibling(nodes: ItemSiblings, node: ItemNode): ItemNode | undefined {
  if (node.isFinished) {
    return undefined;
  }
  const { open } = siblingNodesOf(nodes, node.item.parentItemId);
  const index = open.findIndex((candidate) => candidate.item.id === node.item.id);
  return index > 0 ? open[index - 1] : undefined;
}

/** Whether `node` can be indented under a preceding open sibling. */
export function canIndentNode(nodes: ItemSiblings, node: ItemNode): boolean {
  return precedingOpenSibling(nodes, node) !== undefined;
}

/**
 * Rows to focus once `node` leaves its list, in order: the next sibling in its
 * group (open or finished), the previous one, then the parent.
 */
export function departureFocusIds(nodes: ItemSiblings, node: ItemNode): ReadonlyArray<string> {
  const siblings = siblingNodesOf(nodes, node.item.parentItemId);
  const group = node.isFinished ? siblings.finished : siblings.open;
  const index = group.findIndex((candidate) => candidate.item.id === node.item.id);
  const neighbors = index === -1 ? [] : [group[index + 1], group[index - 1]];
  const neighborIds = neighbors.flatMap((neighbor) =>
    neighbor === undefined ? [] : [neighbor.item.id],
  );
  const parentId = node.item.parentItemId;
  return parentId === null ? neighborIds : [...neighborIds, parentId];
}

/**
 * IDs of the siblings in `node`'s group (open or finished) in persisted order.
 * Alt+Up/Down swaps within this group, as the legacy workspace did.
 */
export function sameGroupSiblingIds(nodes: ItemSiblings, node: ItemNode): ReadonlyArray<string> {
  const siblings = siblingNodesOf(nodes, node.item.parentItemId);
  const group = new Set(
    (node.isFinished ? siblings.finished : siblings.open).map((sibling) => sibling.item.id),
  );
  return persistedSiblingOrder(siblings).filter((id) => group.has(id));
}
