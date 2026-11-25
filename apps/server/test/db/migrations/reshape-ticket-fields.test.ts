import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { Migrator, SqlClient } from "effect/sql";
import { inspectSchema } from "../../../src/db/migrations/inspect-schema.js";
import { databaseMigrations, migrate } from "../../../src/db/migrations/migrate.js";
import { projectId, timestamp, withDatabase } from "../store.js";

const parentTicketId = "019A0000-0000-7000-8000-000000000F11";
const childTicketId = "019A0000-0000-7000-8000-000000000F12";
const todoParentId = "019A0000-0000-7000-8000-000000000F13";
const underTodoId = "019A0000-0000-7000-8000-000000000F14";
const deletedChildId = "019A0000-0000-7000-8000-000000000F15";
const typedTodoId = "019A0000-0000-7000-8000-000000000F16";
const changeTypeId = "019A0000-0000-7000-8000-000000000001";

/** Applies the migrations before this one, as an older app version left the file. */
const migrateToStage16 = Migrator.make({})({
  loader: Effect.map(databaseMigrations, (migrations) => migrations.slice(0, 16)),
});

const insertItem = (
  id: string,
  title: string,
  options: {
    readonly kind?: "Todo" | "Ticket";
    readonly ticketNumber?: string;
    readonly parentId?: string;
    readonly typeId?: string;
    readonly deleted?: boolean;
  } = {},
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const deleted = options.deleted === true ? timestamp : null;
    yield* sql`INSERT INTO TodoItem (Id, ProjectId, ParentItemId, ItemKind, Title, TicketNumber,
        ItemTypeId, Notes, SortOrder, CreatedAtUtc, UpdatedAtUtc, DeletedAtUtc, DeletionBatchId)
      VALUES (${id}, ${projectId}, ${options.parentId ?? null}, ${options.kind ?? "Todo"},
        ${title}, ${options.ticketNumber ?? null}, ${options.typeId ?? null}, ${`${title} notes`},
        0, ${timestamp}, ${timestamp}, ${deleted}, ${deleted === null ? null : id})`;
  });

/**
 * A ticket under a ticket (which had a detail row), a ticket under a ToDo, a deleted ticket
 * under a ticket (no detail row), a ToDo with an item type, a comment, a custom field that
 * used `parentticket` and a saved search naming it.
 */
const populatedStage16 = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* migrateToStage16;
  yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* sql`INSERT INTO Project (Id, Name, SortOrder, CreatedAtUtc, UpdatedAtUtc)
        VALUES (${projectId}, 'Project', 0, ${timestamp}, ${timestamp})`;
      yield* insertItem(parentTicketId, "Payroll", { kind: "Ticket", ticketNumber: "385400" });
      yield* insertItem(childTicketId, "Export", {
        kind: "Ticket",
        ticketNumber: "385405",
        parentId: parentTicketId,
      });
      yield* insertItem(todoParentId, "Plan");
      yield* insertItem(underTodoId, "Badge", {
        kind: "Ticket",
        ticketNumber: "385500",
        parentId: todoParentId,
      });
      yield* insertItem(deletedChildId, "Old", {
        kind: "Ticket",
        ticketNumber: "385406",
        parentId: parentTicketId,
        deleted: true,
      });
      yield* insertItem(typedTodoId, "Typed", { typeId: changeTypeId });
      yield* sql`INSERT INTO TicketDetail (ItemId, RequestorId) VALUES (${childTicketId}, NULL)`;
      yield* sql`INSERT INTO TicketComment (Id, ItemId, Body, CreatedAtUtc)
        VALUES ('019A0000-0000-7000-8000-00000000C0DE', ${childTicketId}, 'Waiting', ${timestamp})`;
      yield* sql`INSERT INTO FieldDefinition (Id, ProjectId, Key, DisplayName, DataType,
          IsArchived, SortOrder)
        VALUES ('019A0000-0000-7000-8000-00000000F1E1', NULL, 'parentticket', 'Parent ticket',
          'Text', 0, 0)`;
      yield* sql`INSERT INTO SavedSearch (Id, Name, QueryText, ScopeKind, ProjectId, FolderId,
          IncludeSubfolders, IncludeCompleted, SortOrder, CreatedAtUtc, UpdatedAtUtc)
        VALUES ('019A0000-0000-7000-8000-00000000F5E1', 'Parents', 'parentticket:385400 type:Change',
          'AllProjects', NULL, NULL, 1, 0, 0, ${timestamp}, ${timestamp})`;
    }),
  );
});

const search = (query: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ ItemId: string }>`SELECT ItemId FROM TodoItemSearch
      JOIN TodoItemSearchRow ON TodoItemSearch.rowid = RowId
      WHERE TodoItemSearch MATCH ${query} ORDER BY ItemId`;
    return rows.map((row) => row.ItemId);
  });

it.effect("Fills a ticket's parent ticket number from a ticket parent, deleted ones too", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* populatedStage16;

    yield* migrate;

    expect(
      yield* sql`SELECT ItemId, ParentTicketNumber, ShowDetailOnCard FROM TicketDetail
        ORDER BY ItemId`,
    ).toEqual([
      { ItemId: childTicketId, ParentTicketNumber: "385400", ShowDetailOnCard: null },
      { ItemId: deletedChildId, ParentTicketNumber: "385400", ShowDetailOnCard: null },
    ]);
    expect(yield* sql`SELECT Id, ParentItemId FROM TodoItem WHERE Id = ${underTodoId}`).toEqual([
      { Id: underTodoId, ParentItemId: todoParentId },
    ]);
  }).pipe(withDatabase),
);

it.effect("Drops item types and comments and keeps every item and its place", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* populatedStage16;
    const placesBefore = yield* sql`SELECT Id, ParentItemId, Title FROM TodoItem ORDER BY Id`;

    yield* migrate;

    const tables = yield* sql`SELECT name FROM sqlite_schema
      WHERE name IN ('ItemType', 'TicketComment', 'IX_TodoItem_ItemTypeId')`;
    const columns = yield* sql<{ name: string }>`SELECT name FROM pragma_table_info('TodoItem')`;
    expect(tables).toEqual([]);
    expect(columns.map((column) => column.name)).not.toContain("ItemTypeId");
    expect(yield* sql`SELECT Id, ParentItemId, Title FROM TodoItem ORDER BY Id`).toEqual(
      placesBefore,
    );
    expect(yield* sql`PRAGMA foreign_key_check`).toEqual([]);
    expect(yield* sql`PRAGMA integrity_check`).toEqual([{ integrity_check: "ok" }]);
    expect(yield* sql.withTransaction(inspectSchema)).toEqual({ efStage: 0, effectStage: 17 });
  }).pipe(withDatabase),
);

it.effect("Keeps search indexed through the rebuild and its triggers working after it", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* populatedStage16;
    const mappingsBefore = yield* sql`SELECT RowId, ItemId FROM TodoItemSearchRow ORDER BY RowId`;

    yield* migrate;
    const mappingsAfter = yield* sql`SELECT RowId, ItemId FROM TodoItemSearchRow ORDER BY RowId`;
    yield* sql.withTransaction(
      sql`UPDATE TodoItem SET Notes = 'Called the vendor' WHERE Id = ${typedTodoId}`,
    );
    yield* sql.withTransaction(sql`DELETE FROM TodoItem WHERE Id = ${underTodoId}`);

    expect(mappingsAfter).toEqual(mappingsBefore);
    expect(yield* search("Payroll")).toEqual([parentTicketId]);
    expect(yield* search("TicketNumber: 385405")).toEqual([childTicketId]);
    expect(yield* search("vendor")).toEqual([typedTodoId]);
    expect(yield* search("Badge")).toEqual([]);
  }).pipe(withDatabase),
);

it.effect("Reserves the parentticket search key and renames saved searches that used it", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* populatedStage16;

    yield* migrate;

    expect(yield* sql`SELECT Key FROM FieldDefinition`).toEqual([{ Key: "parentticket-2" }]);
    expect(yield* sql`SELECT QueryText FROM SavedSearch`).toEqual([
      { QueryText: "parentticket-2:385400 type:Change" },
    ]);
  }).pipe(withDatabase),
);

it.effect("Refuses a stored Detail choice other than shown, hidden or none", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* populatedStage16;
    yield* migrate;

    const failure = yield* Effect.flip(
      sql.withTransaction(
        sql`UPDATE TicketDetail SET ShowDetailOnCard = 2 WHERE ItemId = ${childTicketId}`,
      ),
    );

    expect(String(failure)).toContain("CK_TicketDetail_ShowDetailOnCard");
  }).pipe(withDatabase),
);
