import type { AppliedCompletion, ItemTree } from "@task-tracker/core";
import type { SqlClient } from "effect/sql";
import type { UndoSource } from "../db/undo/undo-rows.js";
import { ticketUndoSource } from "./ticket-ranks.js";

/**
 * Whether saving `applied` adds a numbered next occurrence. Ranking it as a new
 * ticket can also rank legacy tickets of its section in other areas (§7.16).
 */
export function addsTicketOccurrence(tree: ItemTree, applied: AppliedCompletion): boolean {
  const occurrences = applied.occurrences ?? [];
  return occurrences.some(({ itemId }) => tree.get(itemId).ticketNumber !== null);
}

/**
 * The rows an area write can change, including the custom values and links that
 * a next occurrence copies (§7.11), and the ticket fields and comments of tickets
 * that an undone creation removes (§7.19). Each predicate selects them before
 * and after.
 *
 * Pass `ranksTickets` when the write adds or newly numbers an item, so the step
 * also records the ticket ranks an append assigns outside the area (§7.16).
 * Every numbered item is snapshotted then, so leave it off for other writes.
 */
export function areaUndoSources(
  sql: SqlClient.SqlClient,
  projectId: string,
  folderId: string | null,
  ranksTickets: boolean,
): readonly UndoSource[] {
  const areaItems = sql`SELECT Id FROM TodoItem WHERE ProjectId = ${projectId} AND FolderId IS ${folderId}`;
  const area: readonly UndoSource[] = [
    { table: "TodoItem", where: sql`ProjectId = ${projectId} AND FolderId IS ${folderId}` },
    { table: "ItemFieldValue", where: sql`ItemId IN (${areaItems})` },
    { table: "ItemLink", where: sql`ItemId IN (${areaItems})` },
    { table: "TicketDetail", where: sql`ItemId IN (${areaItems})` },
    { table: "TicketComment", where: sql`ItemId IN (${areaItems})` },
  ];
  return ranksTickets ? [...area, ticketUndoSource(sql)] : area;
}
