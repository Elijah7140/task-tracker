import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { databaseMigrations } from "./migrate.js";
import { stageSchema } from "./stage-schema.js";

const efMigrations = [
  "20261113163313_InitialCreate",
  "20261114032356_AddCustomFields",
  "20261114120000_AddItemSearch",
  "20261115054310_AddSavedSearches",
  "20261115121847_AddItemLinks",
  "20261117211849_AddRecurrence",
  "20261117220848_AddReminders",
  "20261118033043_IndexTodayCompletions",
  "20261118045951_AddStatusesAndPriorityNumbers",
  "20261118072606_AddTicketRank",
];
const efHistoryTable = "__EFMigrationsHistory";
const efLockTable = "__EFMigrationsLock";
const effectTable = "effect_sql_migrations";
const historySchema = `CREATE TABLE "${efHistoryTable}" (
  "MigrationId" TEXT NOT NULL CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY,
  "ProductVersion" TEXT NOT NULL
)`;
const lockSchema = `CREATE TABLE "${efLockTable}" (
  "Id" INTEGER NOT NULL CONSTRAINT "PK___EFMigrationsLock" PRIMARY KEY,
  "Timestamp" TEXT NOT NULL
)`;
const effectSchema = `CREATE TABLE "${effectTable}" (
  migration_id integer PRIMARY KEY NOT NULL,
  created_at datetime NOT NULL DEFAULT current_timestamp,
  name VARCHAR(255) NOT NULL
)`;

type SchemaObject = { name: string; sql: string };

const normalize = (statement: string) => statement.trim().replace(/\s+/g, " ");

function unsupported(detail: string) {
  return new Error(`Unrecognized Task Tracker database schema. ${detail}`);
}

function validateObjects(actual: readonly SchemaObject[], expected: readonly string[]) {
  const remaining = new Set(expected.map(normalize));
  for (const object of actual) {
    if (!remaining.delete(normalize(object.sql))) {
      return unsupported(`Unexpected or altered schema object "${object.name}".`);
    }
  }
  for (const statement of remaining) {
    const name = /^(?:CREATE (?:VIRTUAL |UNIQUE )?(?:TABLE|INDEX|TRIGGER)) ["']?([^"' (]+)/.exec(
      statement,
    )?.[1];
    return unsupported(`Missing schema object "${name}".`);
  }
}

const readEfStage = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ MigrationId: string; ProductVersion: string }>`
    SELECT MigrationId, ProductVersion FROM "__EFMigrationsHistory" ORDER BY MigrationId`;
  if (
    rows.length === 0 ||
    rows.some(
      (row, index) =>
        row.MigrationId !== efMigrations[index] ||
        typeof row.ProductVersion !== "string" ||
        !row.ProductVersion.trim(),
    )
  ) {
    return yield* Effect.fail(unsupported("Unexpected EF migration history."));
  }
  return rows.length;
});

const readEffectStage = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const migrations = yield* databaseMigrations;
  const rows = yield* sql<{ migration_id: number; name: string }>`
    SELECT migration_id, name FROM effect_sql_migrations ORDER BY migration_id`;
  if (
    rows.length === 0 ||
    rows.some(
      (row, index) =>
        row.migration_id !== migrations[index]?.[0] || row.name !== migrations[index]?.[1],
    )
  ) {
    return yield* Effect.fail(unsupported("Unexpected Effect migration history."));
  }
  return rows.length;
});

const readHistories = Effect.fnUntraced(function* (schema: readonly SchemaObject[]) {
  const sql = yield* SqlClient.SqlClient;
  const definitions = new Map(schema.map((object) => [object.name, normalize(object.sql)]));
  for (const [table, definition] of [
    [efHistoryTable, historySchema],
    [efLockTable, lockSchema],
    [effectTable, effectSchema],
  ] as const) {
    if (definitions.has(table) && definitions.get(table) !== normalize(definition)) {
      return yield* Effect.fail(unsupported(`Unexpected definition of "${table}".`));
    }
  }
  const efStage = definitions.has(efHistoryTable) ? yield* readEfStage : 0;
  const effectStage = definitions.has(effectTable) ? yield* readEffectStage : 0;
  const hasEfLock = definitions.has(efLockTable);
  if (hasEfLock && (yield* sql`SELECT Id FROM "__EFMigrationsLock" LIMIT 1`).length > 0) {
    return yield* Effect.fail(unsupported("The legacy EF migration lock is held."));
  }
  if (effectStage > 0 && effectStage < efStage) {
    return yield* Effect.fail(unsupported("EF history is ahead of Effect history."));
  }
  return { efStage, effectStage, hasEfLock };
});

/** Identifies a supported schema stage using both migration ledgers and the stored SQLite DDL. */
export const inspectSchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // Autoindexes are implicit in table DDL. SQLite's own statistics tables can appear after ANALYZE.
  const schema = yield* sql<SchemaObject>`
    SELECT name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*'
    ORDER BY name`;
  const { efStage, effectStage, hasEfLock } = yield* readHistories(schema);
  const stage = Math.max(efStage, effectStage);
  const expected = [
    ...stageSchema(stage),
    ...(efStage > 0 ? [historySchema] : []),
    ...(efStage > 0 && hasEfLock ? [lockSchema] : []),
    ...(effectStage > 0 ? [effectSchema] : []),
  ];
  const mismatch = validateObjects(schema, expected);
  if (mismatch) {
    return yield* Effect.fail(mismatch);
  }
  return { efStage, effectStage };
});
