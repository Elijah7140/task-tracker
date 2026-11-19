import type { ItemTree } from "../items/item-tree.js";
import type { TodoItem } from "../items/todo-item.js";
import { nanosecondsPerTick } from "../time/duration-ticks.js";
import { dueToUtc, toUtc } from "../time/floating-time.js";
import type { DisplayedUrgency, Urgency } from "./displayed-urgency.js";
import type { UrgencyThresholds } from "./urgency-thresholds.js";

const urgencyRank: Record<Urgency, number> = {
  None: 0,
  Approaching: 1,
  Imminent: 2,
  Overdue: 3,
};

function effectiveDeadline(item: TodoItem, timeZone: string): Temporal.Instant | null {
  if (item.dueDate !== null) {
    return dueToUtc(item.dueDate, item.dueTime, timeZone);
  }
  return item.scheduledStart === null ? null : toUtc(item.scheduledStart, timeZone);
}

/** Calculate an active, open item's own urgency from its effective deadline. */
export function calculateUrgency(
  item: TodoItem,
  now: Temporal.Instant,
  timeZone: string,
  thresholds: UrgencyThresholds,
): Urgency {
  if (item.completedAtUtc !== null || item.deletedAtUtc !== null) {
    return "None";
  }

  const deadline = effectiveDeadline(item, timeZone);
  if (deadline === null) {
    return "None";
  }
  const remaining = deadline.epochNanoseconds - now.epochNanoseconds;
  if (remaining < 0n) {
    return "Overdue";
  }
  if (remaining <= thresholds.red * nanosecondsPerTick) {
    return "Imminent";
  }
  return remaining <= thresholds.yellow * nanosecondsPerTick ? "Approaching" : "None";
}

function rollUp(
  root: TodoItem,
  descendants: Iterable<TodoItem>,
  now: Temporal.Instant,
  timeZone: string,
  thresholds: UrgencyThresholds,
): DisplayedUrgency {
  let value = calculateUrgency(root, now, timeZone, thresholds);
  let sourceDescendantId: string | null = null;
  // Keep the first highest urgency, preferring the root and then depth-first sibling order.
  for (const item of descendants) {
    const candidate = calculateUrgency(item, now, timeZone, thresholds);
    if (urgencyRank[candidate] > urgencyRank[value]) {
      value = candidate;
      sourceDescendantId = item.id;
    }
  }
  return { value, sourceDescendantId };
}

/** Find the highest urgency and its source in an active item tree branch. */
export function calculateDisplayedUrgency(
  tree: ItemTree,
  id: string,
  now: Temporal.Instant,
  timeZone: string,
  thresholds: UrgencyThresholds,
): DisplayedUrgency {
  return rollUp(tree.get(id), tree.descendants(id), now, timeZone, thresholds);
}

/** The portion of a loaded item node needed to calculate displayed urgency. */
export interface UrgencyNode {
  readonly item: TodoItem;
  readonly children: readonly UrgencyNode[];
}

function* activeDescendants(root: UrgencyNode): Iterable<TodoItem> {
  const pending = root.children.toReversed();
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (node.item.deletedAtUtc === null) {
      yield node.item;
      for (const child of node.children.toReversed()) {
        pending.push(child);
      }
    }
  }
}

/** Find the highest urgency and its source in an already loaded item branch. */
export function calculateDisplayedNodeUrgency(
  root: UrgencyNode,
  now: Temporal.Instant,
  timeZone: string,
  thresholds: UrgencyThresholds,
): DisplayedUrgency {
  const descendants = root.item.deletedAtUtc === null ? activeDescendants(root) : [];
  return rollUp(root.item, descendants, now, timeZone, thresholds);
}
