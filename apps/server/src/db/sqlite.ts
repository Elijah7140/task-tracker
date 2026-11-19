import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue, SQLOutputValue } from "node:sqlite";
import { isArrayBufferView } from "node:util/types";
import { foldSearchText } from "@task-tracker/core";
import { Effect, Layer, Semaphore, Stream } from "effect";
import * as Reactivity from "effect/reactivity/Reactivity";
import { SqlClient, SqlError, Statement } from "effect/sql";
import type { SqlConnection } from "effect/sql";
import { reminderTicks } from "./reminder-ticks-function.js";

function sqliteEffect<A>(operation: string, run: () => A) {
  return Effect.try({
    try: run,
    catch: (cause) => {
      // node:sqlite reports the extended SQLite result code as errcode.
      if (cause instanceof Error && "errcode" in cause) {
        Object.assign(cause, { errno: cause.errcode });
      }
      return new SqlError.SqlError({
        reason: SqlError.classifySqliteError(cause, {
          operation,
          ...(cause instanceof Error && { message: cause.message }),
        }),
      });
    },
  });
}

function bindValue(value: unknown): SQLInputValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    isArrayBufferView(value)
  ) {
    return value;
  }
  throw new TypeError("Encode SQLite parameters as TEXT, INTEGER, REAL, BLOB or NULL");
}

function makeConnection(database: DatabaseSync): SqlConnection.Connection {
  const prepare = <A>(
    sql: string,
    parameters: ReadonlyArray<unknown>,
    run: (statement: ReturnType<DatabaseSync["prepare"]>, values: SQLInputValue[]) => A,
  ) =>
    Effect.flatMap(SqlClient.SafeIntegers, (safeIntegers) =>
      sqliteEffect("execute", () => {
        const statement = database.prepare(sql);
        statement.setReadBigInts(safeIntegers);
        return run(statement, parameters.map(bindValue));
      }),
    );

  const execute: SqlConnection.Connection["execute"] = (sql, parameters, transformRows) =>
    prepare(sql, parameters, (statement, values) => {
      const rows = statement.all(...values);
      return transformRows ? transformRows(rows) : rows;
    });

  const executeValues: SqlConnection.Connection["executeValues"] = (sql, parameters) =>
    prepare(sql, parameters, (statement, values) => {
      statement.setReturnArrays(true);
      // The Node declaration for all() only describes the default object mode.
      return statement.all(...values) as unknown as ReadonlyArray<ReadonlyArray<SQLOutputValue>>;
    });

  return {
    execute,
    executeUnprepared: execute,
    executeValues,
    executeValuesUnprepared: executeValues,
    executeRaw: (sql, parameters) =>
      prepare(sql, parameters, (statement, values) =>
        statement.columns().length === 0 ? statement.run(...values) : statement.all(...values),
      ),
    // Materialize rows so interruption never leaves a native statement iterator open.
    executeStream: (sql, parameters, transformRows) =>
      Stream.unwrap(Effect.map(execute(sql, parameters, transformRows), Stream.fromIterable)),
  };
}

const makeClient = Effect.fnUntraced(function* (path: string) {
  const database = yield* Effect.acquireRelease(
    sqliteEffect("open", () => new DatabaseSync(path, { enableForeignKeyConstraints: true })),
    (database) => sqliteEffect("close", () => database.close()).pipe(Effect.orDie),
  );
  yield* sqliteEffect("configure", () => {
    database.exec("PRAGMA busy_timeout = 5000");
    database.function("tt_fold", { deterministic: true }, (value) =>
      typeof value === "string" ? foldSearchText(value) : null,
    );
    database.function("tt_reminder_ticks", { deterministic: true }, reminderTicks);
  });

  const access = SqlClient.makeSqliteAcquirers({
    connection: Effect.succeed(makeConnection(database)),
    semaphore: yield* Semaphore.make(1),
    isTransaction: () => database.isTransaction,
  });
  return yield* SqlClient.make({
    ...access,
    compiler: Statement.makeCompilerSqlite(),
    driver: "node:sqlite",
    releaseSavepoint: (name) => `RELEASE SAVEPOINT ${name}`,
    spanAttributes: [["db.system.name", "sqlite"]],
  });
});

/** Opens one scoped SQLite connection and leases it exclusively for each transaction. */
export const sqliteLayer = (path: string) =>
  Layer.effect(SqlClient.SqlClient, makeClient(path)).pipe(Layer.provide(Reactivity.layer));
