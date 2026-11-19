import {
  MetadataRuleError,
  renameLookup,
  setPriorityNumber,
  type PriorityLevel,
} from "@task-tracker/core";
import { Effect } from "effect";
import type { SqlClient } from "effect/sql";
import type { ReplayRow } from "./replay-rows.js";
import type { UndoRow } from "./undo-rows.js";

function priorityFromSnapshot(row: UndoRow): PriorityLevel {
  return {
    id: String(row.Id),
    name: String(row.Name),
    number: row.Number === null ? null : Number(row.Number),
    colorKey: row.ColorKey === null ? null : String(row.ColorKey),
    isBuiltIn: row.IsBuiltIn === 1n,
    isArchived: row.IsArchived === 1n,
    sortOrder: Number(row.SortOrder),
  };
}

/** Applies the Core number, name and rank rules to the list replay would produce. */
function validateFinalPriorities(rows: readonly PriorityLevel[]) {
  const orders = new Set<number>();
  for (const row of rows) {
    setPriorityNumber(row, row.number, rows);
    renameLookup(row, row.name, rows);
    if (orders.has(row.sortOrder)) {
      throw new MetadataRuleError("Another priority level already uses the same rank.");
    }
    orders.add(row.sortOrder);
  }
}

/** Checks the final list before replay writes encounter SQLite's unique indexes. */
export const verifyReplayPriorities = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  rows: readonly ReplayRow[],
) {
  const changes = rows.filter(({ table }) => table === "PriorityLevel");
  if (changes.length === 0) {
    return;
  }
  const current = yield* sql<UndoRow>`SELECT * FROM PriorityLevel`;
  const proposed = new Map(current.map(priorityFromSnapshot).map((row) => [row.id, row]));
  for (const { source, target } of changes) {
    if (target === undefined) {
      proposed.delete(String(source?.Id));
    } else {
      proposed.set(String(target.Id), priorityFromSnapshot(target));
    }
  }
  yield* Effect.try({
    try: () => validateFinalPriorities([...proposed.values()]),
    catch: (error) => {
      if (error instanceof MetadataRuleError) {
        return error;
      }
      throw error;
    },
  });
});
