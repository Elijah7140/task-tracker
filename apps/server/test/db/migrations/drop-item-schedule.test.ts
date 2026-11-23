import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { Migrator, SqlClient } from "effect/sql";
import { inspectSchema } from "../../../src/db/migrations/inspect-schema.js";
import { databaseMigrations, migrate } from "../../../src/db/migrations/migrate.js";
import { folderId, projectId, timestamp, withDatabase } from "../store.js";

const parentId = "019A0000-0000-7000-8000-000000000C01";
const childId = "019A0000-0000-7000-8000-000000000C02";
const deletedId = "019A0000-0000-7000-8000-000000000C03";
const fieldId = "019A0000-0000-7000-8000-000000000D01";
const doneId = "019A0000-0000-7000-8000-000000000204";
const queuedId = "019A0000-0000-7000-8000-000000000201";

/** Applies the migrations before this one, as an older app version left the file. */
const migrateToStage13 = Migrator.make({})({
  loader: Effect.map(databaseMigrations, (migrations) => migrations.slice(0, 13)),
});

/** Applies this migration and nothing after it, so later stages don't change the rows read. */
const migrateToStage14 = Migrator.make({})({
  loader: Effect.map(databaseMigrations, (migrations) => migrations.slice(0, 14)),
});

const insertItems = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`INSERT INTO Project (Id, Name, SortOrder, CreatedAtUtc, UpdatedAtUtc)
    VALUES (${projectId}, 'Project', 0, ${timestamp}, ${timestamp})`;
  yield* sql`INSERT INTO Folder (Id, ProjectId, Name, SortOrder, CreatedAtUtc, UpdatedAtUtc)
    VALUES (${folderId}, ${projectId}, 'Folder', 0, ${timestamp}, ${timestamp})`;
  yield* sql`INSERT INTO TodoItem (Id, ProjectId, FolderId, Title, Description, DueDate, DueTime,
      ScheduledStart, ScheduledEnd, SortOrder, CreatedAtUtc, UpdatedAtUtc)
    VALUES (${parentId}, ${projectId}, ${folderId}, 'Planning meeting', 'Agenda', '2026-12-01',
      '09:30:00', '2026-12-01 09:00:00', '2026-12-01 10:00:00', 0, ${timestamp}, ${timestamp})`;
  yield* sql`INSERT INTO TodoItem (Id, ProjectId, FolderId, ParentItemId, ItemKind, Title,
      TicketNumber, StatusId, CompletedAtUtc, ScheduledStart, SortOrder, CreatedAtUtc, UpdatedAtUtc)
    VALUES (${childId}, ${projectId}, ${folderId}, ${parentId}, 'Ticket', 'Release notes',
      'REL-7', ${doneId}, ${timestamp}, '2026-12-02 08:00:00', 0, ${timestamp}, ${timestamp})`;
  yield* sql`INSERT INTO TodoItem (Id, ProjectId, Title, SortOrder, CreatedAtUtc, UpdatedAtUtc,
      DeletedAtUtc, DeletionBatchId)
    VALUES (${deletedId}, ${projectId}, 'Archived draft', 1, ${timestamp}, ${timestamp},
      ${timestamp}, ${deletedId})`;
});

const insertChildRows = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`INSERT INTO FieldDefinition (Id, Key, DisplayName, DataType, IsArchived, SortOrder)
    VALUES (${fieldId}, 'effort', 'Effort', 'Number', 0, 0)`;
  yield* sql`INSERT INTO ItemFieldValue (ItemId, FieldDefinitionId, NumberValue)
    VALUES (${childId}, ${fieldId}, 3)`;
  yield* sql`INSERT INTO ItemLink (Id, ItemId, Url, SortOrder, CreatedAtUtc)
    VALUES ('019A0000-0000-7000-8000-000000000E01', ${parentId}, 'https://example.test', 0,
      ${timestamp})`;
  yield* sql`INSERT INTO TicketDetail (ItemId, Version, IsUrgent, IsSystemOutage)
    VALUES (${childId}, '2.1', 1, 0)`;
  yield* sql`INSERT INTO TicketComment (Id, ItemId, Body, CreatedAtUtc)
    VALUES ('019A0000-0000-7000-8000-000000000E02', ${childId}, 'Shipped', ${timestamp})`;
});

/** A populated database at the stage before the schedule columns were dropped. */
const populatedStage13 = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* migrateToStage13;
  yield* sql.withTransaction(insertItems.pipe(Effect.andThen(insertChildRows)));
});

const itemColumns = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ name: string }>`SELECT name FROM pragma_table_info('TodoItem')`;
  return columns.map(({ name }) => name).filter((name) => !name.startsWith("Scheduled"));
});

/** Every row of the item, child and search tables, items without the schedule columns. */
const readRows = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = (yield* itemColumns).map((name) => `"${name}"`).join(", ");
  const tables = [
    "ItemFieldValue",
    "ItemLink",
    "TicketDetail",
    "TicketComment",
    "TodoItemSearchRow",
    "TodoItemSearch",
  ];
  const rows = [yield* sql.unsafe(`SELECT ${columns} FROM TodoItem ORDER BY Id`)];
  for (const table of tables) {
    rows.push(yield* sql.unsafe(`SELECT rowid, * FROM "${table}" ORDER BY rowid`));
  }
  return rows;
});

const itemIndexes = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql<{ name: string; sql: string }>`
    SELECT name, sql FROM sqlite_schema
    WHERE type IN ('index', 'trigger') AND sql IS NOT NULL AND instr(sql, 'TodoItem') > 0
    ORDER BY name`;
});

const search = (token: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ ItemId: string }>`SELECT ItemId FROM TodoItemSearch
      JOIN TodoItemSearchRow ON TodoItemSearch.rowid = RowId
      WHERE TodoItemSearch MATCH ${token} ORDER BY ItemId`;
    return rows.map((row) => row.ItemId);
  });

it.effect("Drops the schedule columns and keeps every item, child row and search row", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* populatedStage13;
    const rowsBefore = yield* readRows;
    const dependentsBefore = yield* itemIndexes;

    yield* migrateToStage14;

    const columns = yield* sql<{ name: string }>`SELECT name FROM pragma_table_info('TodoItem')`;
    const [table] = yield* sql<{ sql: string }>`
      SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'TodoItem'`;
    expect(columns.map(({ name }) => name)).toEqual(yield* itemColumns);
    expect(columns.map(({ name }) => name)).not.toContain("ScheduledStart");
    expect(table!.sql).not.toContain("Scheduled");
    expect(yield* readRows).toEqual(rowsBefore);
    expect(yield* itemIndexes).toEqual(dependentsBefore);
    expect(yield* sql`PRAGMA foreign_key_check`).toEqual([]);
    expect(yield* sql`PRAGMA integrity_check`).toEqual([{ integrity_check: "ok" }]);
    expect(yield* sql.withTransaction(inspectSchema)).toEqual({ efStage: 0, effectStage: 14 });
  }).pipe(withDatabase),
);

it.effect("Keeps the search and status triggers, cascades and indexes on the rebuilt table", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* populatedStage13;
    yield* migrate;

    yield* sql.withTransaction(sql`UPDATE TodoItem SET Title = 'Kickoff' WHERE Id = ${parentId}`);
    yield* sql.withTransaction(
      sql`INSERT INTO TodoItem (Id, ProjectId, Title, SortOrder, CreatedAtUtc, UpdatedAtUtc)
        VALUES ('019A0000-0000-7000-8000-000000000C04', ${projectId}, 'Retro', 2, ${timestamp},
          ${timestamp})`,
    );
    const statusInUse = yield* Effect.flip(
      sql.withTransaction(sql`DELETE FROM StatusLevel WHERE Id = ${doneId}`),
    );
    const inconsistent = yield* Effect.flip(
      sql.withTransaction(sql`UPDATE TodoItem SET StatusId = ${queuedId} WHERE Id = ${childId}`),
    );
    yield* sql.withTransaction(sql`DELETE FROM TodoItem WHERE Id = ${childId}`);
    const plan = yield* sql<{ detail: string }>`
      EXPLAIN QUERY PLAN SELECT Id FROM TodoItem WHERE ParentItemId = ${parentId}`;

    expect(yield* search("planning")).toEqual([]);
    expect(yield* search("kickoff")).toEqual([parentId]);
    expect(yield* search("retro")).toEqual(["019A0000-0000-7000-8000-000000000C04"]);
    expect(yield* search("release")).toEqual([]);
    expect(statusInUse.message).toContain("This status is still used by an item");
    expect(inconsistent.message).toContain("Item status must agree with completion");
    expect(yield* sql`SELECT ItemId FROM TicketDetail`).toEqual([]);
    expect(yield* sql`SELECT ItemId FROM ItemFieldValue`).toEqual([]);
    expect(plan.map((step) => step.detail).join(" ")).toContain("IX_TodoItem_ParentItemId");
  }).pipe(withDatabase),
);

it.effect("Indexes an item the search tables were missing when it rebuilds the table", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* populatedStage13;
    yield* sql.withTransaction(sql`DELETE FROM TodoItemSearchRow WHERE ItemId = ${parentId}`);
    const missing = yield* search("planning");

    yield* migrate;

    expect(missing).toEqual([]);
    expect(yield* search("planning")).toEqual([parentId]);
    expect(yield* search("release")).toEqual([childId]);
    expect(yield* sql`SELECT count(*) AS count FROM TodoItemSearchRow`).toEqual([{ count: 3 }]);
  }).pipe(withDatabase),
);

it.effect("Gives a repeating item with only a schedule its start date as the due date", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* populatedStage13;
    yield* sql.withTransaction(sql`UPDATE TodoItem SET RecurrenceFrequency = 1,
      RecurrenceInterval = 1, RecurrenceAnchor = 0, RecurrenceEndKind = 0,
      RecurrenceSeriesId = ${parentId} WHERE Id IN (${parentId}, ${childId})`);
    yield* sql.withTransaction(
      sql`UPDATE TodoItem SET ScheduledStart = '2026-12-05 08:15:30.5' WHERE Id = ${deletedId}`,
    );

    yield* migrate;

    expect(yield* sql`SELECT Id, DueDate, DueTime FROM TodoItem ORDER BY Id`).toEqual([
      { Id: parentId, DueDate: "2026-12-01", DueTime: "09:30:00" },
      { Id: childId, DueDate: "2026-12-02", DueTime: null },
      { Id: deletedId, DueDate: null, DueTime: null },
    ]);
  }).pipe(withDatabase),
);
