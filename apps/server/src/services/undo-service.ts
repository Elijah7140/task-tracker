import { MetadataRuleError, UndoHistory, type UndoDirection } from "@task-tracker/core";
import { Context, Effect, Layer, Semaphore } from "effect";
import { SqlClient, type SqlError } from "effect/sql";
import { replayRows } from "../db/undo/replay-rows.js";
import {
  changedRows,
  snapshotRows,
  type UndoRowChange,
  type UndoSource,
  type UndoStepContext,
} from "../db/undo/undo-rows.js";

interface Step {
  readonly label: string;
  readonly rows: readonly UndoRowChange[];
  readonly context: UndoStepContext;
}

const takeSnapshot = (
  sql: SqlClient.SqlClient,
  label: string,
  sources: readonly UndoSource[],
  context: UndoStepContext,
) => Effect.map(snapshotRows(sql, sources), (before) => ({ label, sources, context, before }));

class Recording extends Context.Service<
  Recording,
  {
    start: (
      label: string,
      sources: readonly UndoSource[],
      context: UndoStepContext,
    ) => Effect.Effect<void, SqlError.SqlError>;
  }
>()("TaskTracker/UndoRecording") {}

function replayFailure(
  error: SqlError.SqlError | MetadataRuleError,
  direction: UndoDirection,
): Effect.Effect<never, SqlError.SqlError | MetadataRuleError> {
  if (error instanceof MetadataRuleError) {
    return Effect.fail(error);
  }
  const cause = error.reason.cause;
  if (cause instanceof Error && "errcode" in cause && cause.errcode === 787) {
    return Effect.fail(
      new MetadataRuleError(
        `This change references something that was removed; can't ${direction}.`,
      ),
    );
  }
  if (error.reason._tag === "UniqueViolation") {
    return Effect.fail(
      new MetadataRuleError(
        `Another entry now uses the same name, key or number; can't ${direction}.`,
      ),
    );
  }
  return Effect.fail(error);
}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const gate = yield* Semaphore.make(1);
  const history = new UndoHistory<Step>();
  let revision = 0;

  const status = () =>
    gate.withPermit(
      Effect.sync(() => ({
        undo: history.peek("undo")?.label ?? null,
        redo: history.peek("redo")?.label ?? null,
        revision,
      })),
    );

  const capture = (label: string, sources: readonly UndoSource[], context: UndoStepContext = {}) =>
    Effect.flatMap(Recording, (recording) => recording.start(label, sources, context));

  const record = <A, E, R>(operation: Effect.Effect<A, E, R>) =>
    gate.withPermit(
      sql.withTransaction(
        Effect.gen(function* () {
          let pending: Effect.Success<ReturnType<typeof takeSnapshot>> | undefined;
          const start = (label: string, sources: readonly UndoSource[], context: UndoStepContext) =>
            Effect.gen(function* () {
              if (pending !== undefined) {
                return yield* Effect.die(new Error("An operation can capture only one undo step."));
              }
              pending = yield* takeSnapshot(sql, label, sources, context);
            });
          const result = yield* operation.pipe(Effect.provideService(Recording, { start }));
          if (pending !== undefined) {
            const { before, label, sources, context } = pending;
            const rows = changedRows(before, yield* snapshotRows(sql, sources));
            if (rows.length > 0) {
              yield* sql.afterCommit(
                Effect.sync(() => {
                  history.record({ label, rows, context });
                  revision++;
                }),
              );
            }
          }
          return result;
        }),
      ),
    );

  const apply = (direction: UndoDirection) =>
    gate.withPermit(
      sql
        .withTransaction(
          Effect.gen(function* () {
            const step = history.peek(direction);
            if (step === undefined) {
              return null;
            }
            yield* replayRows(sql, step.rows, direction, step.context);
            yield* sql.afterCommit(
              Effect.sync(() => {
                history.advance(direction);
                revision++;
              }),
            );
            return { label: step.label, revision: revision + 1 };
          }),
        )
        .pipe(
          Effect.provideService(SqlClient.BeginTransaction, "BEGIN IMMEDIATE"),
          Effect.catch((error) => replayFailure(error, direction)),
        ),
    );

  return { status, capture, record, apply };
});

/** Shares commit-time recording and replay across all services in one server session. */
export class UndoService extends Context.Service<UndoService>()("TaskTracker/UndoService", {
  make,
}) {
  static readonly layer = Layer.effect(this, make);
}

/** Names the action after the entity the user acted on, even for a cascade. */
export const undoLabel = (verb: string, name: string) => `${verb} '${name}'`;
