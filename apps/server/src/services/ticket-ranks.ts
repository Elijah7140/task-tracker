import { planTicketAppend } from "@task-tracker/core";
import { Effect } from "effect";
import type { SqlClient } from "effect/sql";
import { ticketRepository } from "../db/repositories/ticket-repository.js";
import type { UndoSource } from "../db/undo/undo-rows.js";

/**
 * Every numbered item. Ticket moves and appends change ranks only on these
 * rows, and the predicate selects the same rows before and after the write.
 */
export const ticketUndoSource = (sql: SqlClient.SqlClient): UndoSource => ({
  table: "TodoItem",
  where: sql`TicketNumber IS NOT NULL`,
});

/**
 * Ranks items that just became open tickets at the bottom of their sections,
 * in the given order, on the caller's transaction (§7.16). Run it after their
 * rows are saved; IDs that are not open tickets are skipped.
 */
export const appendNewTickets = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  itemIds: ReadonlyArray<string>,
) {
  if (itemIds.length === 0) {
    return;
  }
  const tickets = ticketRepository(sql);
  const open = yield* tickets.listOpen(null);
  const byId = new Map(open.map((ticket) => [ticket.id, ticket]));
  const incoming = itemIds.flatMap((id) => byId.get(id) ?? []);
  const ranks = planTicketAppend(open, incoming);
  yield* Effect.forEach(ranks, tickets.setRank, { discard: true });
});
