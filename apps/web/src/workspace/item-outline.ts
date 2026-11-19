import type { AreaSnapshot } from "@task-tracker/contracts";

/** One item with its server-computed urgency, finished flag and sub-items. */
export type ItemNode = (typeof AreaSnapshot.Type)["items"][number];

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

/** Finds an item's title anywhere in the tree, for urgency attribution. */
export function findItemTitle(nodes: ReadonlyArray<ItemNode>, itemId: string): string | undefined {
  for (const node of nodes) {
    if (node.item.id === itemId) {
      return node.item.title;
    }
    const nested = findItemTitle(node.children, itemId);
    if (nested !== undefined) {
      return nested;
    }
  }
  return undefined;
}
