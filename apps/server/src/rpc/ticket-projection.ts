import type { TicketListEntryProjection, TicketSnapshot } from "@task-tracker/contracts";
import type { TicketDetail, TicketListEntry } from "@task-tracker/core";

/**
 * A ticket's fixed fields (§7.19). The card's Detail choice reaches the renderer through the
 * area snapshot instead, and an editor save leaves it as stored.
 */
export function projectTicket(detail: TicketDetail): typeof TicketSnapshot.Type {
  const { itemId, showDetailOnCard: _cardChoice, ...fields } = detail;
  return { itemId, detail: fields };
}

/** A ticket list entry as the renderer sees it. */
export function projectTicketListEntry(
  entry: TicketListEntry,
): typeof TicketListEntryProjection.Type {
  return entry;
}
