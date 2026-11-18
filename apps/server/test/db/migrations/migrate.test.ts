import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { Migrator, SqlClient } from "effect/sql";
import { databaseMigrations, migrate } from "../../../src/db/migrations/migrate.js";
import { insertProject, withDatabase, withSchema } from "../store.js";

it.effect("Seeds the built-in lookups with EF's stored IDs, order and flags", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const types = yield* sql.withTransaction(
      sql`SELECT Id, Name, SortOrder, IsBuiltIn, IsArchived, ColorKey, IconKey FROM ItemType ORDER BY SortOrder`
        .values,
    );
    const priorities = yield* sql.withTransaction(
      sql`SELECT Id, Name, SortOrder, IsBuiltIn, IsArchived, ColorKey FROM PriorityLevel ORDER BY SortOrder`
        .values,
    );

    expect(types).toEqual([
      ["019A0000-0000-7000-8000-000000000001", "Change", 0, 1, 0, null, null],
      ["019A0000-0000-7000-8000-000000000002", "Error", 1, 1, 0, null, null],
      ["019A0000-0000-7000-8000-000000000003", "Discussion", 2, 1, 0, null, null],
    ]);
    expect(priorities).toEqual([
      ["019A0000-0000-7000-8000-000000000101", "Critical", 0, 1, 0, null],
      ["019A0000-0000-7000-8000-000000000102", "High", 1, 1, 0, null],
      ["019A0000-0000-7000-8000-000000000103", "Medium", 2, 1, 0, null],
      ["019A0000-0000-7000-8000-000000000104", "Low", 3, 1, 0, null],
    ]);
  }).pipe(withSchema),
);

it.effect("Applies the second schema stage once without rewriting existing rows", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* Migrator.make({})({
      loader: Effect.map(databaseMigrations, (migrations) => migrations.slice(0, 1)),
    });
    const tables = sql`SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name`.values;
    expect(yield* tables).toEqual([
      ["Folder"],
      ["GlobalSetting"],
      ["ItemType"],
      ["PriorityLevel"],
      ["Project"],
      ["ProjectSetting"],
      ["TodoItem"],
      ["effect_sql_migrations"],
    ]);
    yield* sql.withTransaction(
      insertProject.pipe(
        Effect.andThen(sql`UPDATE ItemType SET Name = ${"Renamed"} WHERE SortOrder = 0`),
      ),
    );

    const upgrade = yield* migrate;
    const replay = yield* migrate;

    expect(upgrade).toEqual([[2, "AddCustomFields"]]);
    expect(replay).toEqual([]);
    expect(yield* tables).toEqual([
      ["FieldChoice"],
      ["FieldDefinition"],
      ["Folder"],
      ["GlobalSetting"],
      ["ItemFieldValue"],
      ["ItemType"],
      ["PriorityLevel"],
      ["Project"],
      ["ProjectSetting"],
      ["TodoItem"],
      ["effect_sql_migrations"],
    ]);
    expect(yield* sql`SELECT Name FROM Project`.values).toEqual([["Project"]]);
    expect(yield* sql`SELECT Name FROM ItemType ORDER BY SortOrder`.values).toEqual([
      ["Renamed"],
      ["Error"],
      ["Discussion"],
    ]);
    expect(
      yield* sql`SELECT migration_id, name FROM effect_sql_migrations ORDER BY migration_id`.values,
    ).toEqual([
      [1, "InitialCreate"],
      [2, "AddCustomFields"],
    ]);
  }).pipe(withDatabase),
);

it.effect("Rolls back pending schema changes and ledger entries when a migration fails", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`CREATE TABLE FieldChoice (Sentinel TEXT)`;

    const error = yield* Effect.flip(migrate);

    expect(error).toMatchObject({
      kind: "Failed",
      message: 'Migration "2_AddCustomFields" failed',
    });
    expect(
      yield* sql.withTransaction(
        sql`SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name`.values,
      ),
    ).toEqual([["FieldChoice"]]);
  }).pipe(withDatabase),
);
