import { allSiblings, findItemNode, type ItemNode, type ItemSiblings } from "./item-outline.js";
import type { PriorityGroup } from "./priority-groups.js";
import { cardStatusId, type StatusRank } from "./status-rank.js";
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

/** The range of slots among a section's cards that keeps a card of `rank` in status order. */
function statusRun(cards: ReadonlyArray<ItemNode>, statusRank: StatusRank, rank: number) {
  const rankAt = (index: number) => statusRank(cardStatusId(cards[index]!));
  let lower = 0;
  while (lower < cards.length && rankAt(lower) < rank) {
    lower += 1;
  }
  let upper = lower;
  while (upper < cards.length && rankAt(upper) === rank) {
    upper += 1;
  }
  return { lower, upper };
}

/** A card to land beside, and on which side. */
interface CardAnchor {
  readonly targetId: string;
  readonly position: "before" | "after";
}

/**
 * The card a move lands beside for a slot among a section's other cards. It prefers a card with
 * the moved card's status, so the saved sibling order puts the card exactly in that slot of its
 * status run; with no such card, any neighbour keeps the status order.
 */
function anchorAt(
  cards: ReadonlyArray<ItemNode>,
  run: { readonly lower: number; readonly upper: number },
  slot: number,
): CardAnchor | null {
  const before = cards[slot];
  const after = cards[slot - 1];
  if (slot < run.upper && before !== undefined) {
    return { targetId: before.item.id, position: "before" };
  }
  if (slot > run.lower && after !== undefined) {
    return { targetId: after.item.id, position: "after" };
  }
  if (before !== undefined) {
    return { targetId: before.item.id, position: "before" };
  }
  return after === undefined ? null : { targetId: after.item.id, position: "after" };
}

/**
 * Places `source` at the slot of `group` nearest `desiredIndex` among the section's other cards
 * that keeps it among the cards with its status: after every card with an earlier status and
 * before every card with a later one (§7.17). When that is the desired slot itself, the move
 * keeps the `requested` card and side, such as the card under the pointer. Returns `null` when
 * the section has no other card to land beside.
 */
function placeInGroup(
  nodes: ItemSiblings,
  group: PriorityGroup,
  source: ItemNode,
  desiredIndex: number,
  requested?: CardAnchor,
): CardPlacement | null {
  const cards = group.cards.filter((card) => card.item.id !== source.item.id);
  const run = statusRun(cards, group.statusRank, group.statusRank(cardStatusId(source)));
  const slot = Math.min(run.upper, Math.max(run.lower, desiredIndex));
  const anchor =
    slot === desiredIndex && requested !== undefined ? requested : anchorAt(cards, run, slot);
  if (anchor === null) {
    return null;
  }
  const { targetId, position } = anchor;
  const index = otherTopLevel(nodes, source.item.id).findIndex((row) => row.item.id === targetId);
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

/** The section holding the open card `cardId`. */
function groupOf(groups: ReadonlyArray<PriorityGroup>, cardId: string) {
  return groups.find((candidate) => candidate.cards.some((card) => card.item.id === cardId));
}

/** The open item a card move can carry: not finished and in this level's tree. */
function movableSource(nodes: ItemSiblings, sourceId: string) {
  const source = findItemNode(nodes, sourceId);
  return source === undefined || source.isFinished ? undefined : source;
}

/**
 * Places a dragged item before or after an open card, in that card's priority section. Cards
 * sort by status inside a section, so a drop beside a card with another status lands at the
 * nearest slot among the cards with the item's own status; the status never changes. Returns
 * `null` for drops onto self, outside the open card grid, from a finished item, or for
 * `"into"` drops (which make a sub-item and are handled by `DropItem`).
 */
export function mapCardDrop(
  nodes: ItemSiblings,
  groups: ReadonlyArray<PriorityGroup>,
  sourceId: string,
  targetId: string,
  position: ItemDropPosition,
): CardPlacement | null {
  const group = groupOf(groups, targetId);
  const source = movableSource(nodes, sourceId);
  if (group === undefined || source === undefined || sourceId === targetId || position === "into") {
    return null;
  }
  const cards = group.cards.filter((card) => card.item.id !== sourceId);
  const targetIndex = cards.findIndex((card) => card.item.id === targetId);
  const desiredIndex = targetIndex + (position === "after" ? 1 : 0);
  return placeInGroup(nodes, group, source, desiredIndex, { targetId, position });
}

/**
 * Places a dragged item at the end of a section (a drop on its header): after the section's last
 * card with the item's status, or where that status sorts when the section has none.
 */
export function mapCardDropToGroupEnd(
  nodes: ItemSiblings,
  sourceId: string,
  group: PriorityGroup,
): CardPlacement | null {
  const source = movableSource(nodes, sourceId);
  return source === undefined ? null : placeInGroup(nodes, group, source, group.cards.length);
}

/** The sections a card can step into: every active section and its own archived one. */
function assignableGroups(groups: ReadonlyArray<PriorityGroup>, cardId: string) {
  return groups.filter(
    (group) => !group.isArchived || group.cards.some((card) => card.item.id === cardId),
  );
}

/**
 * Moves an open card one place in reading order among the cards with its status (§7.17).
 * Inside a section it swaps with its neighbour when that card has the same status. Otherwise
 * it enters the neighbouring section: at the end of the section above, or at the start of the
 * section below, within that section's cards of its status. Archived sections other than the
 * card's own are skipped, since an archived level cannot be assigned. Returns `null` at either
 * end of the grid.
 */
export function stepCard(
  nodes: ItemSiblings,
  groups: ReadonlyArray<PriorityGroup>,
  cardId: string,
  offset: -1 | 1,
): CardPlacement | null {
  const order = assignableGroups(groups, cardId);
  const groupIndex = order.findIndex((group) =>
    group.cards.some((card) => card.item.id === cardId),
  );
  const group = order[groupIndex];
  const source = movableSource(nodes, cardId);
  if (group === undefined || source === undefined) {
    return null;
  }
  const cardIndex = group.cards.findIndex((card) => card.item.id === cardId);
  const neighbour = group.cards[cardIndex + offset];
  const sameStatus =
    neighbour !== undefined &&
    group.statusRank(cardStatusId(neighbour)) === group.statusRank(cardStatusId(source));
  if (sameStatus) {
    return mapCardDrop(nodes, groups, cardId, neighbour.item.id, offset > 0 ? "after" : "before");
  }
  const next = order[groupIndex + offset];
  if (next === undefined) {
    return null;
  }
  return placeInGroup(nodes, next, source, offset > 0 ? 0 : next.cards.length);
}
