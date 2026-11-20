import { MetadataRuleError, repeatedSavedSearchName, type UndoDirection } from "@task-tracker/core";
import { Effect } from "effect";
import type { SqlClient } from "effect/sql";
import type { ReplayRow } from "./replay-rows.js";

/**
 * Checks the written saved-search names with Core's case-insensitive comparison. SQLite's
 * NOCASE index only folds ASCII letters, so a replay could otherwise add a clashing name.
 */
export const verifyReplaySavedSearches = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  rows: readonly ReplayRow[],
  direction: UndoDirection,
) {
  if (!rows.some(({ table }) => table === "SavedSearch")) {
    return;
  }
  const names = yield* sql<{ readonly Name: string }>`SELECT Name FROM SavedSearch ORDER BY Id`;
  if (repeatedSavedSearchName(names.map((row) => row.Name)) !== undefined) {
    return yield* Effect.fail(
      new MetadataRuleError(
        `Another entry now uses the same name, key or number; can't ${direction}.`,
      ),
    );
  }
});
