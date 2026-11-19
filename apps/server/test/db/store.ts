import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { migrate } from "../../src/db/migrations/migrate.js";
import { sqliteLayer } from "../../src/db/sqlite.js";

export const timestamp = "2026-11-13 12:00:00";
export const projectId = "019A0000-0000-7000-8000-000000000AAA";
export const folderId = "019A0000-0000-7000-8000-000000000BBB";
export const itemId = "019A0000-0000-7000-8000-000000000CCC";

/** Runs a test with a fresh SQLite connection closed at the end of the test. */
export const withDatabase = Effect.provide(sqliteLayer(":memory:"));

/** Applies all migrations on a fresh database before running a test. */
export const withSchema = <A, E>(test: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.andThen(migrate, test).pipe(withDatabase);

export const insertProject = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`INSERT INTO Project (Id, Name, SortOrder, CreatedAtUtc, UpdatedAtUtc)
             VALUES (${projectId}, ${"Project"}, 0, ${timestamp}, ${timestamp})`;
});

export const insertItem = (parentFolder: string | null = null) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`INSERT INTO TodoItem (Id, ProjectId, FolderId, Title, SortOrder, CreatedAtUtc, UpdatedAtUtc)
               VALUES (${itemId}, ${projectId}, ${parentFolder}, ${"Item"}, 0, ${timestamp}, ${timestamp})`;
  });
