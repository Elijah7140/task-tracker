import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { Migrator, SqlClient } from "effect/sql";
import { inspectSchema } from "../../../src/db/migrations/inspect-schema.js";
import { databaseMigrations, migrate } from "../../../src/db/migrations/migrate.js";
import { projectId, timestamp, withDatabase } from "../store.js";

const todoId = "019A0000-0000-7000-8000-000000000F01";
const ticketId = "019A0000-0000-7000-8000-000000000F02";
const deletedId = "019A0000-0000-7000-8000-000000000F03";

/** Applies the migrations before this one, as an older app version left the file. */
const migrateToStage15 = Migrator.make({})({
  loader: Effect.map(databaseMigrations, (migrations) => migrations.slice(0, 15)),
});

/** A ToDo whose notes are in Description, a ticket with a Detail and a deleted ToDo. */
const insertItems = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`INSERT INTO Project (Id, Name, SortOrder, CreatedAtUtc, UpdatedAtUtc)
    VALUES (${projectId}, 'Project', 0, ${timestamp}, ${timestamp})`;
  yield* sql`INSERT INTO TodoItem (Id, ProjectId, Title, Description, SortOrder, CreatedAtUtc,
      UpdatedAtUtc)
    VALUES (${todoId}, ${projectId}, 'Plan rollout', 'Book the training room', 0, ${timestamp},
      ${timestamp})`;
  yield* sql`INSERT INTO TodoItem (Id, ProjectId, ItemKind, Title, Description, TicketNumber,
      SortOrder, CreatedAtUtc, UpdatedAtUtc)
    VALUES (${ticketId}, ${projectId}, 'Ticket', 'Payroll export', 'Stops at the contractor',
      '385405', 1, ${timestamp}, ${timestamp})`;
  yield* sql`INSERT INTO TodoItem (Id, ProjectId, Title, Description, SortOrder, CreatedAtUtc,
      UpdatedAtUtc, DeletedAtUtc, DeletionBatchId)
    VALUES (${deletedId}, ${projectId}, 'Old draft', 'Archived wording', 2, ${timestamp},
      ${timestamp}, ${timestamp}, ${deletedId})`;
});

const populatedStage15 = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* migrateToStage15;
  yield* sql.withTransaction(insertItems);
});

const readTexts = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql`SELECT Id, Description, Notes FROM TodoItem ORDER BY Id`;
});

const search = (query: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ ItemId: string }>`SELECT ItemId FROM TodoItemSearch
      JOIN TodoItemSearchRow ON TodoItemSearch.rowid = RowId
      WHERE TodoItemSearch MATCH ${query} ORDER BY ItemId`;
    return rows.map((row) => row.ItemId);
  });

it.effect("Moves a ToDo's description into its notes and keeps a ticket's detail", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* populatedStage15;
    const mappingsBefore = yield* sql`SELECT RowId, ItemId FROM TodoItemSearchRow ORDER BY RowId`;

    yield* migrate;

    expect(yield* readTexts).toEqual([
      { Id: todoId, Description: null, Notes: "Book the training room" },
      { Id: ticketId, Description: "Stops at the contractor", Notes: null },
      { Id: deletedId, Description: null, Notes: "Archived wording" },
    ]);
    expect(yield* sql`SELECT RowId, ItemId FROM TodoItemSearchRow ORDER BY RowId`).toEqual(
      mappingsBefore,
    );
    expect(yield* sql`PRAGMA integrity_check`).toEqual([{ integrity_check: "ok" }]);
    expect(yield* sql.withTransaction(inspectSchema)).toEqual({ efStage: 0, effectStage: 16 });
  }).pipe(withDatabase),
);

it.effect("Reindexes every item with its notes, including deleted items", () =>
  Effect.gen(function* () {
    yield* populatedStage15;

    yield* migrate;

    expect(yield* search("training")).toEqual([todoId]);
    expect(yield* search("Notes: training")).toEqual([todoId]);
    expect(yield* search("Description: contractor")).toEqual([ticketId]);
    expect(yield* search("archived")).toEqual([deletedId]);
  }).pipe(withDatabase),
);

it.effect("Keeps notes searchable as items are added, edited and removed", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* populatedStage15;
    yield* migrate;

    yield* sql.withTransaction(
      sql`UPDATE TodoItem SET Notes = 'Called the vendor' WHERE Id = ${ticketId}`,
    );
    yield* sql.withTransaction(
      sql`INSERT INTO TodoItem (Id, ProjectId, Title, Notes, SortOrder, CreatedAtUtc, UpdatedAtUtc)
        VALUES ('019A0000-0000-7000-8000-000000000F04', ${projectId}, 'Retro', 'Gather feedback',
          3, ${timestamp}, ${timestamp})`,
    );
    yield* sql.withTransaction(sql`DELETE FROM TodoItem WHERE Id = ${todoId}`);

    expect(yield* search("vendor")).toEqual([ticketId]);
    expect(yield* search("contractor")).toEqual([ticketId]);
    expect(yield* search("feedback")).toEqual(["019A0000-0000-7000-8000-000000000F04"]);
    expect(yield* search("training")).toEqual([]);
  }).pipe(withDatabase),
);
