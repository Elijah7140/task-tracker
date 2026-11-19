import type { PriorityLevel } from "../lookups/priority-level.js";
import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import { orderTickets, type RankedTicket, type TicketRankAssignment } from "./ticket-ranks.js";

/** Shown when the moved item is no longer an open numbered item. */
export const TICKET_NOT_OPEN = "This item is no longer an open ticket.";

/** Shown when the drop anchor left the destination section. */
export const TICKET_ANCHOR_MOVED = "The target ticket has moved or is no longer open.";

/** Shown when a ticket would enter an archived or missing level. */
export const TICKET_PRIORITY_INACTIVE = "Choose an active priority level.";

/**
 * Where a ticket goes: before or after `anchorId` in the destination section,
 * or at its start without an anchor. The anchor is looked up among all open
 * tickets, so a project filter never changes the global order (§7.16).
 */
export interface TicketPosition {
  readonly priorityLevelId: string | null;
  readonly anchorId: string | null;
  readonly after: boolean;
}

/** The writes of an effective move: the priority and the destination section's ranks. */
export interface TicketMovePlan {
  readonly priorityLevelId: string | null;
  readonly priorityChanged: boolean;
  readonly ranks: ReadonlyArray<TicketRankAssignment>;
}

function requireActiveDestination(
  priorities: ReadonlyArray<PriorityLevel>,
  priorityLevelId: string | null,
) {
  if (priorityLevelId === null) {
    return;
  }
  if (!priorities.some((level) => level.id === priorityLevelId && !level.isArchived)) {
    throw new MetadataRuleError(TICKET_PRIORITY_INACTIVE);
  }
}

function insertionIndex(section: ReadonlyArray<RankedTicket>, position: TicketPosition): number {
  if (position.anchorId === null) {
    return 0;
  }
  const index = section.findIndex(({ id }) => id === position.anchorId);
  if (index < 0) {
    throw new MetadataRuleError(TICKET_ANCHOR_MOVED);
  }
  return position.after ? index + 1 : index;
}

/**
 * Plans moving one open ticket (§7.16). With `append`, as Set priority does,
 * it goes after every ticket of the new section and an unchanged priority is a
 * no-op. A move that leaves the ticket where it is returns null. Otherwise the
 * destination section gets consecutive ranks from zero; the old section keeps
 * its ranks.
 */
export function planTicketMove(
  tickets: ReadonlyArray<RankedTicket>,
  priorities: ReadonlyArray<PriorityLevel>,
  itemId: string,
  position: TicketPosition,
  { append = false }: { readonly append?: boolean } = {},
): TicketMovePlan | null {
  const moving = tickets.find(({ id }) => id === itemId);
  if (moving === undefined) {
    throw new MetadataRuleError(TICKET_NOT_OPEN);
  }
  const priorityChanged = moving.priorityLevelId !== position.priorityLevelId;
  if ((append && !priorityChanged) || position.anchorId === itemId) {
    return null;
  }
  if (priorityChanged) {
    requireActiveDestination(priorities, position.priorityLevelId);
  }
  const section = orderTickets(
    tickets.filter(({ priorityLevelId }) => priorityLevelId === position.priorityLevelId),
  );
  const previousIndex = section.indexOf(moving);
  const others = section.filter((ticket) => ticket !== moving);
  const index = append ? others.length : insertionIndex(others, position);
  if (index === previousIndex) {
    return null;
  }
  others.splice(index, 0, moving);
  const ranks = others.map(({ id }, rank) => ({ id, rank }));
  return { priorityLevelId: position.priorityLevelId, priorityChanged, ranks };
}
