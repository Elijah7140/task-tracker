/** The fields that place an open ticket in its priority section (§7.16). */
export interface RankedTicket {
  readonly id: string;
  readonly priorityLevelId: string | null;
  /** The hand-set position within the section, kept apart from the tree order. */
  readonly ticketRank: number | null;
  readonly createdAtUtc: Temporal.Instant;
}

/** A rank to store on one ticket. */
export interface TicketRankAssignment {
  readonly id: string;
  readonly rank: number;
}

function compareIds(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function compareRanks(left: number | null, right: number | null): number {
  if (left === null || right === null) {
    return (left === null ? 1 : 0) - (right === null ? 1 : 0);
  }
  return left - right;
}

/**
 * The order within a ticket section: ranked tickets by rank, then legacy
 * unranked tickets by creation time, with the item ID breaking ties.
 */
export function compareTickets(left: RankedTicket, right: RankedTicket): number {
  return (
    compareRanks(left.ticketRank, right.ticketRank) ||
    Temporal.Instant.compare(left.createdAtUtc, right.createdAtUtc) ||
    compareIds(left.id, right.id)
  );
}

/** Returns the tickets in section order without changing the input. */
export function orderTickets<Ticket extends RankedTicket>(
  tickets: ReadonlyArray<Ticket>,
): Array<Ticket> {
  return tickets.toSorted(compareTickets);
}

/** Groups tickets by priority, keeping the order in which each priority first appears. */
function bySection<Ticket extends RankedTicket>(tickets: ReadonlyArray<Ticket>) {
  const sections = new Map<string | null, Array<Ticket>>();
  for (const ticket of tickets) {
    const section = sections.get(ticket.priorityLevelId) ?? [];
    section.push(ticket);
    sections.set(ticket.priorityLevelId, section);
  }
  return sections;
}

function appendSection(
  existing: ReadonlyArray<RankedTicket>,
  additions: ReadonlyArray<RankedTicket>,
): Array<TicketRankAssignment> {
  const ranks = existing.flatMap(({ ticketRank }) => (ticketRank === null ? [] : [ticketRank]));
  let nextRank = ranks.length === 0 ? 0 : Math.max(...ranks) + 1;
  const unranked = orderTickets(existing.filter(({ ticketRank }) => ticketRank === null));
  return [...unranked, ...additions].map(({ id }) => ({ id, rank: nextRank++ }));
}

/**
 * Ranks tickets that just became open numbered items at the bottom of their
 * sections, in the order they were added (§7.16). Each touched section first
 * ranks its legacy unranked tickets in their current order. `existing` holds
 * the other open tickets; any incoming ticket among them is ignored there.
 */
export function planTicketAppend(
  existing: ReadonlyArray<RankedTicket>,
  incoming: ReadonlyArray<RankedTicket>,
): Array<TicketRankAssignment> {
  const incomingIds = new Set(incoming.map(({ id }) => id));
  const others = bySection(existing.filter(({ id }) => !incomingIds.has(id)));
  return [...bySection(incoming)].flatMap(([priorityLevelId, additions]) =>
    appendSection(others.get(priorityLevelId) ?? [], additions),
  );
}
