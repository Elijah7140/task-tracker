import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";
import { activeRow } from "../../src/db/active-row.js";
import {
  folderId,
  insertItem,
  insertProject,
  itemId,
  projectId,
  timestamp,
  withSchema,
} from "./store.js";

it.effect("Hides soft-deleted projects, folders and items from active queries", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* insertProject;
        yield* sql`INSERT INTO Folder (Id, ProjectId, Name, SortOrder, CreatedAtUtc, UpdatedAtUtc)
                 VALUES (${folderId}, ${projectId}, ${"Folder"}, 0, ${timestamp}, ${timestamp})`;
        yield* insertItem(folderId);
      }),
    );
    const activeIds = SqlSchema.findAll({
      Request: Schema.Literals(["Project", "Folder", "TodoItem"]),
      Result: Schema.Struct({ Id: Schema.String }),
      execute: (table) =>
        sql`SELECT row.Id FROM ${sql(table)} AS row WHERE ${activeRow(sql, "row")}`,
    });

    for (const [table, id] of [
      ["Project", projectId],
      ["Folder", folderId],
      ["TodoItem", itemId],
    ] as const) {
      expect(yield* sql.withTransaction(activeIds(table))).toEqual([{ Id: id }]);
      yield* sql.withTransaction(
        sql`UPDATE ${sql(table)} SET DeletedAtUtc = ${timestamp} WHERE Id = ${id}`,
      );

      expect(yield* sql.withTransaction(activeIds(table))).toEqual([]);
      expect(yield* sql.withTransaction(sql`SELECT Id FROM ${sql(table)}`.values)).toEqual([[id]]);
    }
  }).pipe(withSchema),
);
