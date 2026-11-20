import type { PriorityLevelProjection } from "@task-tracker/contracts";
import type { ItemNode } from "./item-outline.js";

/** Heading for open top-level items with no priority or an unknown priority ID. */
export const NO_PRIORITY_TITLE = "No priority";

/** One priority section of the workspace card grid and the open top-level cards in it (§7.17). */
export interface PriorityGroup {
  /** The priority level this section represents, or `null` for "No priority". */
  readonly priorityLevelId: string | null;
  readonly title: string;
  readonly isArchived: boolean;
  readonly cards: ReadonlyArray<ItemNode>;
  readonly countLabel: string;
}

function makeGroup(
  priorityLevelId: string | null,
  title: string,
  isArchived: boolean,
  cards: ReadonlyArray<ItemNode>,
): PriorityGroup {
  return {
    priorityLevelId,
    title,
    isArchived,
    cards,
    countLabel: cards.length === 1 ? "1 item" : `${cards.length} items`,
  };
}

/**
 * Sorts open top-level items into the card grid's priority sections: "No priority" first, then
 * one section per priority level in level `sortOrder` (never by level number, §7.15). Archived
 * levels appear while open items still use them. Empty sections are omitted (§7.17). Cards keep
 * the order they arrive in.
 */
export function buildPriorityGroups(
  openItems: ReadonlyArray<ItemNode>,
  priorityLevels: ReadonlyArray<typeof PriorityLevelProjection.Type>,
): ReadonlyArray<PriorityGroup> {
  const knownIds = new Set(priorityLevels.map((level) => level.id));
  const groups: Array<PriorityGroup> = [];

  const plain = openItems.filter(
    (node) => node.item.priorityLevelId === null || !knownIds.has(node.item.priorityLevelId),
  );
  if (plain.length > 0) {
    groups.push(makeGroup(null, NO_PRIORITY_TITLE, false, plain));
  }

  const orderedLevels = priorityLevels.toSorted((left, right) => left.sortOrder - right.sortOrder);
  for (const level of orderedLevels) {
    const cards = openItems.filter((node) => node.item.priorityLevelId === level.id);
    if (cards.length > 0) {
      groups.push(makeGroup(level.id, level.label, level.isArchived, cards));
    }
  }

  return groups;
}
