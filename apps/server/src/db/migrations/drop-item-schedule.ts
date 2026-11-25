import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { rebuildItemTable } from "./rebuild-item-table.js";

const scheduleParts = [
  /\s*"ScheduledStart" TEXT NULL,/,
  /\s*"ScheduledEnd" TEXT NULL,/,
  /\s*CONSTRAINT "CK_TodoItem_ScheduledEnd" CHECK \(ScheduledEnd IS NULL OR \(ScheduledStart IS NOT NULL AND ScheduledEnd >= ScheduledStart\)\),/,
];

/** The TodoItem table definition without the schedule columns and their check (§7.4). */
export function withoutSchedule(statement: string) {
  return scheduleParts.reduce((table, part) => table.replace(part, ""), statement);
}

/**
 * A repeat rule needs a due date (§7.11). A repeating item that had only a
 * schedule takes the schedule's start date as its due date, so it keeps repeating.
 */
const dateScheduleOnlyRepeats = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`UPDATE TodoItem SET DueDate = substr(ScheduledStart, 1, 10)
    WHERE DueDate IS NULL AND ScheduledStart IS NOT NULL AND RecurrenceFrequency IS NOT NULL`;
});

/**
 * Reconciles the search tables with the rebuilt items (§7.2): drops full-text
 * rows without a mapping and indexes any item that has no mapping or text row.
 */
const reconcileSearch = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`DELETE FROM TodoItemSearch
    WHERE rowid NOT IN (SELECT RowId FROM TodoItemSearchRow)`;
  yield* sql`INSERT INTO TodoItemSearchRow (ItemId)
    SELECT Id FROM TodoItem WHERE Id NOT IN (SELECT ItemId FROM TodoItemSearchRow)`;
  yield* sql`INSERT INTO TodoItemSearch (rowid, Title, Description, TicketNumber)
    SELECT mapping.RowId, item.Title, item.Description, item.TicketNumber
    FROM TodoItem item JOIN TodoItemSearchRow mapping ON mapping.ItemId = item.Id
    WHERE mapping.RowId NOT IN (SELECT rowid FROM TodoItemSearch)`;
});

/**
 * Drops `ScheduledStart`, `ScheduledEnd` and their check (§7.4), after giving
 * schedule-only repeating items a due date. The check names
 * both columns, so SQLite cannot drop them in place, and foreign keys stay on
 * inside the migration transaction. The table is rebuilt instead: items are
 * copied, child rows set aside, the old table dropped and the copy renamed, then
 * indexes, triggers (the search triggers among them) and children come back
 * and the search tables are reconciled.
 */
export default Effect.gen(function* () {
  yield* dateScheduleOnlyRepeats;
  yield* rebuildItemTable({ reshape: withoutSchedule, reconcileSearch });
});
