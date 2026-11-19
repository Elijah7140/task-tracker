import type { AreaSnapshot } from "@task-tracker/contracts";

/** One item with its server-computed urgency, finished flag and sub-items. */
export type ItemNode = (typeof AreaSnapshot.Type)["items"][number];

/** Focus request issued after a tree mutation updates or remounts a row. */
export interface ItemFocusRequest {
  readonly id: string;
  readonly expectedParentId?: string | null | undefined;
  readonly afterNodes?: ReadonlyArray<ItemNode> | undefined;
}

/** A sibling list split into open work and finished branches (§6.2). */
export interface SplitItems {
  readonly open: ReadonlyArray<ItemNode>;
  /** Finished branches, newest-completed first. */
  readonly finished: ReadonlyArray<ItemNode>;
}

/**
 * Orders ISO UTC instants with differing fractional precision, such as
 * `12:00:00Z` and `12:00:00.5Z`, by padding the fraction.
 */
function instantSortKey(instant: string | null): string {
  if (instant === null) {
    return "";
  }
  const [whole = "", fraction = ""] = instant.replace("Z", "").split(".");
  return `${whole}.${fraction.padEnd(9, "0")}`;
}

function newestCompletedFirst(left: ItemNode, right: ItemNode): number {
  const leftKey = instantSortKey(left.item.completedAtUtc);
  const rightKey = instantSortKey(right.item.completedAtUtc);
  return leftKey === rightKey ? 0 : leftKey < rightKey ? 1 : -1;
}

/**
 * Splits siblings by the server's `isFinished` flag. Open items keep their
 * sibling order and finished items are shown newest-completed first.
 */
export function splitFinished(nodes: ReadonlyArray<ItemNode>): SplitItems {
  return {
    open: nodes.filter((node) => !node.isFinished),
    finished: nodes.filter((node) => node.isFinished).toSorted(newestCompletedFirst),
  };
}

/** Finds an item node anywhere in the tree by ID. */
export function findItemNode(nodes: ReadonlyArray<ItemNode>, itemId: string): ItemNode | undefined {
  for (const node of nodes) {
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
export function findItemTitle(nodes: ReadonlyArray<ItemNode>, itemId: string): string | undefined {
  return findItemNode(nodes, itemId)?.item.title;
}

/** Returns ancestor IDs from the top-level item down to the direct parent of `itemId`. */
export function itemAncestorIds(
  nodes: ReadonlyArray<ItemNode>,
  itemId: string,
): ReadonlyArray<string> {
  const path: Array<string> = [];
  let current = findItemNode(nodes, itemId);
  while (current !== undefined && current.item.parentItemId !== null) {
    path.unshift(current.item.parentItemId);
    current = findItemNode(nodes, current.item.parentItemId);
  }
  return path;
}

/** Returns the sibling slice under `parentItemId` (`null` selects root items). */
export function siblingNodesOf(
  nodes: ReadonlyArray<ItemNode>,
  parentItemId: string | null,
): ReadonlyArray<ItemNode> {
  if (parentItemId === null) {
    return nodes;
  }
  return findItemNode(nodes, parentItemId)?.children ?? [];
}

/** Lists every item in depth-first order with its depth, for parent pickers. */
export function flattenItemNodes(
  nodes: ReadonlyArray<ItemNode>,
  depth = 0,
): ReadonlyArray<{ readonly node: ItemNode; readonly depth: number }> {
  return nodes.flatMap((node) => [{ node, depth }, ...flattenItemNodes(node.children, depth + 1)]);
}

/**
 * Finds the visible open sibling immediately before `node`, skipping finished
 * siblings so Notion-style indent never moves work into a hidden Completed branch.
 */
export function precedingOpenSibling(
  nodes: ReadonlyArray<ItemNode>,
  node: ItemNode,
): ItemNode | undefined {
  if (node.isFinished) {
    return undefined;
  }
  const { open } = splitFinished(siblingNodesOf(nodes, node.item.parentItemId));
  const index = open.findIndex((candidate) => candidate.item.id === node.item.id);
  return index > 0 ? open[index - 1] : undefined;
}

/** Whether `node` can be indented under a preceding open sibling. */
export function canIndentNode(nodes: ReadonlyArray<ItemNode>, node: ItemNode): boolean {
  return precedingOpenSibling(nodes, node) !== undefined;
}
