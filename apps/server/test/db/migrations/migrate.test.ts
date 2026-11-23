import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { Migrator, SqlClient } from "effect/sql";
import { databaseMigrations, migrate } from "../../../src/db/migrations/migrate.js";
import {
  insertItem,
  insertProject,
  itemId,
  timestamp,
  withDatabase,
  withSchema,
} from "../store.js";

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

it.effect("Applies pending schema stages once without rewriting existing lookups", () =>
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

    expect(upgrade).toHaveLength(13);
    expect(upgrade.at(-1)).toEqual([14, "DropItemSchedule"]);
    expect(replay).toEqual([]);
    expect(yield* tables).toContainEqual(["TodoItemSearch"]);
    expect(yield* tables).toContainEqual(["FieldDefinition"]);
    expect(yield* sql`SELECT Name FROM Project`.values).toEqual([["Project"]]);
    expect(yield* sql`SELECT Name FROM ItemType ORDER BY SortOrder`.values).toEqual([
      ["Renamed"],
      ["Error"],
      ["Discussion"],
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

it.effect(
  "Backfills old items and keeps their search row IDs through updates, deletion and restore",
  () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* Migrator.make({})({
        loader: Effect.map(databaseMigrations, (migrations) => migrations.slice(0, 2)),
      });
      yield* sql.withTransaction(insertProject.pipe(Effect.andThen(insertItem())));
      const find = (token: string) =>
        sql`SELECT ItemId, RowId FROM TodoItemSearch
        JOIN TodoItemSearchRow ON TodoItemSearch.rowid = RowId
        WHERE TodoItemSearch MATCH ${token}`.values;

      yield* migrate;
      const original = yield* find("Item");
      yield* sql.withTransaction(
        sql`UPDATE TodoItem SET Title = 'Café', DeletedAtUtc = ${timestamp}`,
      );
      const softDeleted = yield* find("cafe");
      yield* sql.withTransaction(sql`UPDATE TodoItem SET DeletedAtUtc = NULL`);
      const restored = yield* find("cafe");
      const obsolete = yield* find("Item");
      yield* sql.withTransaction(sql`DELETE FROM TodoItem`);
      const purged = yield* find("cafe");
      yield* sql.withTransaction(insertItem());
      const inserted = yield* find("Item");

      expect(original).toEqual([[itemId, 1]]);
      expect(softDeleted).toEqual(original);
      expect(restored).toEqual(original);
      expect(obsolete).toEqual([]);
      expect(purged).toEqual([]);
      expect(inserted).toEqual([[itemId, 2]]);
    }).pipe(withDatabase),
);

it.effect("Reserves project search keys and rewrites only matching clauses in scope", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* Migrator.make({})({
      loader: Effect.map(databaseMigrations, (migrations) => migrations.slice(0, 4)),
    });
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* insertProject;
        yield* insertItem();
        yield* sql`UPDATE TodoItem SET CompletedAtUtc = ${timestamp}`;
        yield* sql`INSERT INTO FieldDefinition (Id, Key, DisplayName, DataType, IsArchived, SortOrder, ProjectId)
        VALUES ('custom-link', 'link', 'Old link', 'Text', 0, 0, (SELECT Id FROM Project)),
               ('occupied', 'LINK-2', 'Occupied', 'Text', 1, 1, NULL),
               ('custom-repeats', 'repeats', 'Old repeats', 'Text', 0, 2, NULL),
               ('custom-reminder', 'reminder', 'Old reminder', 'Text', 0, 3, NULL),
               ('custom-completed', 'completed', 'Old completed', 'Text', 0, 4, NULL)`;
        yield* sql`INSERT INTO SavedSearch (Id, Name, QueryText, ScopeKind, ProjectId, IncludeSubfolders,
        IncludeCompleted, SortOrder, CreatedAtUtc, UpdatedAtUtc)
        VALUES ('all', 'All', ${'LINK~"link:test" has:" LINK " "link:value" no:link..link STATUS:true __workflowstatus:Testing completed:notes reminder!=10 repeats:1..2'}, 'AllProjects', NULL, 0, 1, 0, ${timestamp}, ${timestamp}),
               ('area', 'Area', 'no:link', 'Area', (SELECT Id FROM Project), 1, 0, 1, ${timestamp}, ${timestamp}),
               ('other', 'Other', 'link:value', 'Project', 'other-project', 0, 0, 2, ${timestamp}, ${timestamp}),
               ('invalid', 'Invalid', ${'status:"malformed"tail status:"unclosed link:value'}, 'AllProjects', NULL, 0, 0, 3, ${timestamp}, ${timestamp})`;
      }),
    );

    yield* migrate;

    expect(yield* sql`SELECT Key FROM FieldDefinition ORDER BY SortOrder`.values).toEqual([
      ["link-3"],
      ["LINK-2"],
      ["repeats-2"],
      ["reminder-2"],
      ["completed-2"],
    ]);
    expect(yield* sql`SELECT QueryText FROM SavedSearch ORDER BY SortOrder`.values).toEqual([
      [
        'link-3~"link:test" has:link-3 "link:value" no:link..link completed:true status:Testing completed-2:notes reminder-2!=10 repeats-2:1..2',
      ],
      ["no:link-3"],
      ["link:value"],
      ['status:"malformed"tail status:"unclosed link:value'],
    ]);
    expect(
      yield* sql`SELECT CompletedAtUtc, StatusId, ReopenStatusId FROM TodoItem`.values,
    ).toEqual([[timestamp, "019A0000-0000-7000-8000-000000000204", null]]);
  }).pipe(withDatabase),
);

it.effect(
  "Reserves saved-search keywords using the first available suffix and keeps field values",
  () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* Migrator.make({})({
        loader: Effect.map(databaseMigrations, (migrations) => migrations.slice(0, 3)),
      });
      yield* sql.withTransaction(
        Effect.gen(function* () {
          yield* insertProject;
          yield* insertItem();
          yield* sql`INSERT INTO FieldDefinition (Id, Key, DisplayName, DataType, IsArchived, SortOrder)
        VALUES ('has', 'has', 'Has', 'Text', 0, 0), ('has-2', 'has-2', 'Other', 'Text', 1, 1),
               ('no', 'no', 'No', 'Text', 0, 2), ('is', 'is', 'Is', 'Text', 0, 3)`;
          yield* sql`INSERT INTO ItemFieldValue (ItemId, FieldDefinitionId, TextValue)
        VALUES (${itemId}, 'has', 'Preserved')`;
        }),
      );

      yield* migrate;

      expect(yield* sql`SELECT Key FROM FieldDefinition ORDER BY SortOrder`.values).toEqual([
        ["has-3"],
        ["has-2"],
        ["no-2"],
        ["is-2"],
      ]);
      expect(
        yield* sql`SELECT TextValue FROM ItemFieldValue WHERE FieldDefinitionId = 'has'`.values,
      ).toEqual([["Preserved"]]);
    }).pipe(withDatabase),
);

it.effect("Renames custom fields that used a ticket search key and rewrites saved searches", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* Migrator.make({})({
      loader: Effect.map(databaseMigrations, (migrations) => migrations.slice(0, 11)),
    });
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`INSERT INTO FieldDefinition (Id, Key, DisplayName, DataType, IsArchived, SortOrder, ProjectId)
        VALUES ('custom-module', 'module', 'Module', 'Text', 0, 0, NULL),
               ('custom-version', 'version', 'Version', 'Text', 0, 1, NULL)`;
        yield* sql`INSERT INTO SavedSearch (Id, Name, QueryText, ScopeKind, ProjectId, IncludeSubfolders,
        IncludeCompleted, SortOrder, CreatedAtUtc, UpdatedAtUtc)
        VALUES ('all', 'All', 'module:train version:1', 'AllProjects', NULL, 0, 1, 0, ${timestamp}, ${timestamp})`;
      }),
    );

    yield* migrate;

    expect(yield* sql`SELECT Key FROM FieldDefinition ORDER BY SortOrder`.values).toEqual([
      ["module-2"],
      ["version-2"],
    ]);
    expect(yield* sql`SELECT QueryText FROM SavedSearch`.values).toEqual([
      ["module-2:train version-2:1"],
    ]);
  }).pipe(withDatabase),
);

it.effect("Marks only the seeded In progress status as in progress", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const marked = yield* sql.withTransaction(
      sql`SELECT Name FROM StatusLevel WHERE IsInProgress = 1`.values,
    );

    expect(marked).toEqual([["In progress"]]);
  }).pipe(withSchema),
);

it.effect("Refuses the In progress mark on a Done status in storage", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const refused = yield* Effect.flip(
      sql.withTransaction(sql`UPDATE StatusLevel SET IsInProgress = 1 WHERE Kind = 1`),
    );

    expect(String(refused.cause)).toContain("CK_StatusLevel_IsInProgress");
  }).pipe(withSchema),
);
