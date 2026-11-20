import type { UndoDirection } from "@task-tracker/core";
import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import type { UndoTable } from "../../../src/db/undo/undo-rows.js";
import { UndoService } from "../../../src/services/undo-service.js";

/** Reads whole tables through a fresh transaction, soft-deleted rows included. */
export const snapshotTables = (tables: readonly UndoTable[]) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return yield* sql.withTransaction(
      Effect.forEach(tables, (table) => sql`SELECT * FROM ${sql(table)} ORDER BY rowid`),
    );
  });

/**
 * Runs one recorded operation, then undoes and redoes it. Returns the persisted tables after
 * each phase and the label the operation recorded, for the legacy round-trip assertions.
 */
export const roundTrip = <A, E, R>(
  operation: Effect.Effect<A, E, R>,
  tables: readonly UndoTable[],
) =>
  Effect.gen(function* () {
    const undo = yield* UndoService;
    const before = yield* snapshotTables(tables);
    yield* operation;
    const after = yield* snapshotTables(tables);
    const { undo: label } = yield* undo.status();
    yield* undo.apply("undo");
    const undone = yield* snapshotTables(tables);
    yield* undo.apply("redo");
    const redone = yield* snapshotTables(tables);
    return { label, before, after, undone, redone };
  });

/**
 * Changes data outside history, then attempts a replay. Returns the refusal with the tables
 * and history status before and after it, so a test can assert nothing moved.
 */
export const refuseAfterChange = (
  statement: string,
  direction: UndoDirection,
  tables: readonly UndoTable[],
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const undo = yield* UndoService;
    yield* sql.withTransaction(sql.unsafe(statement));
    const changed = yield* snapshotTables(tables);
    const history = yield* undo.status();
    const failure = yield* Effect.flip(undo.apply(direction));
    return {
      failure,
      changed,
      history,
      afterTables: yield* snapshotTables(tables),
      afterHistory: yield* undo.status(),
    };
  });
