import type { PriorityLevel } from "../lookups/priority-level.js";
import { orderTickets, type RankedTicket } from "./ticket-ranks.js";

/** One section of the Tickets view. A null priority is the No priority section. */
export interface TicketSection<Ticket extends RankedTicket> {
  readonly priority: PriorityLevel | null;
  readonly tickets: ReadonlyArray<Ticket>;
}

/**
 * Arranges open tickets into No priority followed by one section per level in
 * level sort order; a level's number is only a label (§7.15, §7.16). Active
 * levels always have a section. An archived level has one while it holds tickets.
 */
export function buildTicketSections<Ticket extends RankedTicket>(
  tickets: ReadonlyArray<Ticket>,
  priorities: ReadonlyArray<PriorityLevel>,
): Array<TicketSection<Ticket>> {
  const inSection = (priorityLevelId: string | null) =>
    orderTickets(tickets.filter((ticket) => ticket.priorityLevelId === priorityLevelId));
  const levels = priorities
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .map((priority) => ({ priority, tickets: inSection(priority.id) }))
    .filter(({ priority, tickets: rows }) => !priority.isArchived || rows.length > 0);
  return [{ priority: null, tickets: inSection(null) }, ...levels];
}
