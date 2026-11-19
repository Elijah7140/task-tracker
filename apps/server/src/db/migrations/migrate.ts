import { Effect } from "effect";
import { Migrator, SqlClient } from "effect/sql";
import addCustomFields from "./add-custom-fields.js";
import initialCreate from "./initial-create.js";

/** The two legacy schema stages in Effect migration order. */
export const databaseMigrations = Migrator.fromRecord({
  "1_InitialCreate": initialCreate,
  "2_AddCustomFields": addCustomFields,
});

/** Records the validated EF stages and applies any remaining migrations in the same transaction. */
export const migrateFromEf = (efStage: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const loader = Effect.map(databaseMigrations, (migrations) =>
      migrations.map(
        ([id, name, load]) =>
          [id, name, id <= efStage ? Effect.succeed(Effect.void) : load] as const,
      ),
    );
    // Include creation of the migration ledger in the same transaction as the schema.
    return yield* sql.withTransaction(Migrator.make({})({ loader }));
  }).pipe(Effect.provideService(SqlClient.BeginTransaction, "BEGIN IMMEDIATE"));

/** Applies pending Effect migrations to a fresh or Effect-managed database. */
export const migrate = migrateFromEf(0);
