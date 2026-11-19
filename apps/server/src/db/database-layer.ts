import { statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { backupDatabase } from "./backup-database.js";
import { databasePath } from "./database-path.js";
import { inspectSchema } from "./migrations/inspect-schema.js";
import { databaseMigrations, migrateFromEf } from "./migrations/migrate.js";
import { sqliteLayer } from "./sqlite.js";

const preparePath = (path: string) =>
  Effect.tryPromise({
    try: async () => {
      if (!path) {
        throw new Error("The database path is empty.");
      }
      const absolute = resolve(path);
      await mkdir(dirname(absolute), { recursive: true });
      const existing = statSync(absolute, { throwIfNoEntry: false });
      return { absolute, existed: existing !== undefined };
    },
    catch: (cause) => new Error(String(cause), { cause }),
  });

const initialize = Effect.fnUntraced(function* (path: string, existed: boolean) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql
    .withTransaction(
      Effect.gen(function* () {
        const { efStage, effectStage } = yield* inspectSchema;
        const migrations = yield* databaseMigrations;
        if (effectStage === migrations.length) {
          return;
        }
        if (existed || efStage > 0 || effectStage > 0) {
          yield* backupDatabase(path);
        }
        yield* migrateFromEf(efStage);
      }),
    )
    .pipe(Effect.provideService(SqlClient.BeginTransaction, "BEGIN IMMEDIATE"));
});

/** Opens the legacy file in place and publishes the client only after successful startup. */
export const databaseLayer = (path = databasePath()) =>
  Layer.effect(
    SqlClient.SqlClient,
    Effect.gen(function* () {
      const { absolute, existed } = yield* preparePath(path);
      const database = yield* Layer.build(sqliteLayer(absolute));
      yield* initialize(absolute, existed).pipe(Effect.provide(database));
      return Context.get(database, SqlClient.SqlClient);
    }).pipe(
      Effect.mapError(
        (cause) =>
          new Error(`Could not initialize Task Tracker database at "${path}". ${cause.message}`, {
            cause,
          }),
      ),
    ),
  );
