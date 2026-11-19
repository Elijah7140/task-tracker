import { MetadataRuleError, statusListConflict, type UndoDirection } from "@task-tracker/core";
import { Effect } from "effect";
import type { SqlClient } from "effect/sql";
import type { ReplayRow } from "./replay-rows.js";

/**
 * Checks the final status list after a replay writes lookup rows. SQLite enforces kinds,
 * the active Done status and item references, but not Unicode-aware names or ranks.
 */
export const verifyReplayStatuses = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  rows: readonly ReplayRow[],
  direction: UndoDirection,
) {
  if (!rows.some(({ table }) => table === "StatusLevel")) {
    return;
  }
  const statuses = yield* sql<{ Name: string; SortOrder: number | bigint }>`
    SELECT Name, SortOrder FROM StatusLevel`;
  const conflict = statusListConflict(
    statuses.map((row) => ({ name: row.Name, sortOrder: Number(row.SortOrder) })),
  );
  if (conflict !== null) {
    return yield* Effect.fail(
      new MetadataRuleError(`Another status now uses the same ${conflict}; can't ${direction}.`),
    );
  }
});
