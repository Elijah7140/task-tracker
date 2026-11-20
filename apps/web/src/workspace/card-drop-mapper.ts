import { allSiblings, findItemNode, type ItemNode, type ItemSiblings } from "./item-outline.js";
import type { PriorityGroup } from "./priority-groups.js";
import type { ItemDropPosition } from "./use-item-drag.js";

/**
 * Where a moved card lands (§7.17): a priority and an index among the area's other top-level
 * items, plus the card it lands beside, which a reorder within one section uses instead.
 */
export interface CardPlacement {
  readonly priorityLevelId: string | null;
  readonly index: number;
  readonly targetId: string;
  readonly position: "before" | "after";
}

/**
 * True when a placement only reorders a card inside its own section of the level it sits in:
 * the area's top level, or a drilled-in item's children (§7.19). Such a move keeps finished
 * items in their saved slots, like any sibling reorder (§6.4).
 */
export function keepsSection(
  source: ItemNode,
  placement: CardPlacement,
  levelParentId: string | null = null,
) {
  return (
    source.item.parentItemId === levelParentId &&
    source.item.priorityLevelId === placement.priorityLevelId
  );
}

/** All top-level items in persisted `sortOrder` excluding `sourceId`. */
function otherTopLevel(nodes: ItemSiblings, sourceId: string): ReadonlyArray<ItemNode> {
  return allSiblings(nodes)
    .filter((node) => node.item.id !== sourceId)
    .toSorted((left, right) => left.item.sortOrder - right.item.sortOrder);
}

/**
 * Places a dragged item before or after an open card, in that card's priority section.
 * Returns `null` for drops onto self, outside the open card grid, from a finished item,
 * or for `"into"` drops (which make a sub-item and are handled by `DropItem`).
 */
export function mapCardDrop(
  nodes: ItemSiblings,
  groups: ReadonlyArray<PriorityGroup>,
  sourceId: string,
  targetId: string,
  position: ItemDropPosition,
): CardPlacement | null {
  const group = groups.find((candidate) =>
    candidate.cards.some((card) => card.item.id === targetId),
  );
  const source = findItemNode(nodes, sourceId);
  if (
    group === undefined ||
    source === undefined ||
    source.isFinished ||
    sourceId === targetId ||
    position === "into"
  ) {
    return null;
  }

  const others = otherTopLevel(nodes, sourceId);
  const index = others.findIndex((row) => row.item.id === targetId);
  if (index === -1) {
    return null;
  }
  return {
    priorityLevelId: group.priorityLevelId,
    index: index + (position === "after" ? 1 : 0),
    targetId,
    position,
  };
}

/** Places a dragged item after the last other card of a section (a drop on its header). */
export function mapCardDropToGroupEnd(
  nodes: ItemSiblings,
  groups: ReadonlyArray<PriorityGroup>,
  sourceId: string,
  group: PriorityGroup,
): CardPlacement | null {
  const last = [...group.cards].reverse().find((card) => card.item.id !== sourceId);
  return last === undefined ? null : mapCardDrop(nodes, groups, sourceId, last.item.id, "after");
}

/** The sections a card can step into: every active section and its own archived one. */
function assignableGroups(groups: ReadonlyArray<PriorityGroup>, cardId: string) {
  return groups.filter(
    (group) => !group.isArchived || group.cards.some((card) => card.item.id === cardId),
  );
}

/**
 * Moves an open card one place in reading order. Inside a section it swaps with its neighbour.
 * At a section edge it enters the neighbouring section: at the end of the section above, or
 * at the start of the section below. Archived sections other than the card's own are skipped,
 * since an archived level cannot be assigned. Returns `null` at either end of the grid (§7.17).
 */
export function stepCard(
  nodes: ItemSiblings,
  groups: ReadonlyArray<PriorityGroup>,
  cardId: string,
  offset: -1 | 1,
): CardPlacement | null {
  const order = assignableGroups(groups, cardId).flatMap((group) =>
    group.cards.map((card) => ({ card, group })),
  );
  const index = order.findIndex((entry) => entry.card.item.id === cardId);
  const neighbourIndex = index + offset;
  if (index < 0 || neighbourIndex < 0 || neighbourIndex >= order.length) {
    return null;
  }

  const current = order[index]!;
  const neighbour = order[neighbourIndex]!;
  const sameGroup = neighbour.group === current.group;
  const movesDown = offset > 0;
  const position: "before" | "after" = movesDown === sameGroup ? "after" : "before";
  return mapCardDrop(nodes, groups, cardId, neighbour.card.item.id, position);
}
