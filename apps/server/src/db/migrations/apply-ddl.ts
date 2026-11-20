import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/** Runs migration statements sequentially on the caller's connection. */
export const applyDdl = Effect.fnUntraced(function* (statements: readonly string[]) {
  const sql = yield* SqlClient.SqlClient;
  yield* Effect.forEach(statements, (statement) => sql.unsafe(statement), { discard: true });
});

/** Builds additive DDL so foreign keys, dependent rows and triggers remain in place. */
export const addColumns = (table: string, columns: readonly string[]) =>
  applyDdl(columns.map((column) => `ALTER TABLE ${table} ADD COLUMN ${column}`));
