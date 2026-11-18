import { Effect } from "effect";
import { Migrator, SqlClient } from "effect/sql";
import addCustomFields from "./add-custom-fields.js";
import initialCreate from "./initial-create.js";

/** The two legacy schema stages in Effect migration order. */
export const databaseMigrations = Migrator.fromRecord({
  "1_InitialCreate": initialCreate,
  "2_AddCustomFields": addCustomFields,
});

/** Applies pending Effect migrations to a fresh or Effect-managed database. */
export const migrate = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // Include creation of the migration ledger in the same transaction as the schema.
  return yield* sql.withTransaction(Migrator.make({})({ loader: databaseMigrations }));
}).pipe(Effect.provideService(SqlClient.BeginTransaction, "BEGIN IMMEDIATE"));
