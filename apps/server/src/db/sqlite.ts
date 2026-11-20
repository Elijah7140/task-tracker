import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue, SQLOutputValue, StatementSync } from "node:sqlite";
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

/** How many distinct SQL texts keep a prepared statement. */
const STATEMENT_CACHE_SIZE = 256;

/**
 * Reuses prepared statements by SQL text, least recently used first out.
 * Preparing is a large share of each query's cost: an insert into `TodoItem`
 * also compiles its search triggers. SQLite re-prepares a cached statement
 * itself after a schema change, and closing the database finalizes them all.
 */
function statementCache(database: DatabaseSync) {
  const statements = new Map<string, StatementSync>();
  return (sql: string) => {
    const cached = statements.get(sql);
    if (cached !== undefined) {
      statements.delete(sql);
      statements.set(sql, cached);
      return cached;
    }
    const statement = database.prepare(sql);
    statements.set(sql, statement);
    const oldest = statements.keys().next();
    if (statements.size > STATEMENT_CACHE_SIZE && oldest.done !== true) {
      statements.delete(oldest.value);
    }
    return statement;
  };
}

function makeConnection(database: DatabaseSync): SqlConnection.Connection {
  const statementFor = statementCache(database);
  // A cached statement keeps its last read modes, so every use sets both.
  const prepare = <A>(
    sql: string,
    parameters: ReadonlyArray<unknown>,
    returnArrays: boolean,
    run: (statement: StatementSync, values: SQLInputValue[]) => A,
  ) =>
    Effect.flatMap(SqlClient.SafeIntegers, (safeIntegers) =>
      sqliteEffect("execute", () => {
        const statement = statementFor(sql);
        statement.setReadBigInts(safeIntegers);
        statement.setReturnArrays(returnArrays);
        return run(statement, parameters.map(bindValue));
      }),
    );

  const execute: SqlConnection.Connection["execute"] = (sql, parameters, transformRows) =>
    prepare(sql, parameters, false, (statement, values) => {
      const rows = statement.all(...values);
      return transformRows ? transformRows(rows) : rows;
    });

  const executeValues: SqlConnection.Connection["executeValues"] = (sql, parameters) =>
    prepare(sql, parameters, true, (statement, values) => {
      // The Node declaration for all() only describes the default object mode.
      return statement.all(...values) as unknown as ReadonlyArray<ReadonlyArray<SQLOutputValue>>;
    });

  return {
    execute,
    executeUnprepared: execute,
    executeValues,
    executeValuesUnprepared: executeValues,
    executeRaw: (sql, parameters) =>
      prepare(sql, parameters, false, (statement, values) =>
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
