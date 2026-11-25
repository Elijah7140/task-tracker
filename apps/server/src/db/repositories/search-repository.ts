import type { ItemQuery, ItemSearchResults, SearchableField } from "@task-tracker/core";
import { Effect, Schema } from "effect";
import { SqlSchema, type SqlClient } from "effect/sql";
import { activeRow } from "../active-row.js";
import { buildSearchSql } from "../search-sql-builder.js";
import { Bit, Guid } from "../storage-codecs.js";

/**
 * One projected search row. Dates and times stay in their stored ISO text, which
 * the wire contract accepts unchanged.
 */
const SearchRow = Schema.Struct({
  itemId: Guid,
  projectId: Guid,
  projectName: Schema.String,
  folderId: Schema.NullOr(Guid),
  parentItemId: Schema.NullOr(Guid),
  title: Schema.String,
  ticketNumber: Schema.NullOr(Schema.String),
  priorityLevelId: Schema.NullOr(Guid),
  dueDate: Schema.NullOr(Schema.String),
  dueTime: Schema.NullOr(Schema.String),
  isCompleted: Bit,
  statusId: Schema.NullOr(Guid),
}).pipe(
  Schema.encodeKeys({
    itemId: "Id",
    projectId: "ProjectId",
    projectName: "ProjectName",
    folderId: "FolderId",
    parentItemId: "ParentItemId",
    title: "Title",
    ticketNumber: "TicketNumber",
    priorityLevelId: "PriorityLevelId",
    dueDate: "DueDate",
    dueTime: "DueTime",
    isCompleted: "IsCompleted",
    statusId: "StatusId",
  }),
);

const LocatedItem = Schema.Struct({
  itemId: Guid,
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
}).pipe(Schema.encodeKeys({ itemId: "Id", projectId: "ProjectId", folderId: "FolderId" }));

/** Runs validated searches and active-item lookups on the caller's transaction (§7.2). */
export function searchRepository(sql: SqlClient.SqlClient) {
  const runQuery = SqlSchema.findAll({
    Request: Schema.Struct({ text: Schema.String, parameters: Schema.Array(Schema.Any) }),
    Result: SearchRow,
    execute: ({ text, parameters }) => sql.unsafe(text, parameters),
  });

  /** Reads one page of at most `limit` rows and whether more matched. */
  const search = (query: ItemQuery, fields: ReadonlyArray<SearchableField>, limit: number) =>
    Effect.gen(function* () {
      const built = buildSearchSql(query, fields, limit);
      const rows = yield* runQuery({ text: built.sql, parameters: built.parameters });
      const hasMore = rows.length > limit;
      return { items: hasMore ? rows.slice(0, limit) : rows, hasMore } satisfies ItemSearchResults;
    });

  /** Finds an item that is active with its folder and project, or nothing. */
  const locate = SqlSchema.findOneOption({
    Request: Guid,
    Result: LocatedItem,
    execute: (itemId) => sql`SELECT t.Id, t.ProjectId, t.FolderId
      FROM TodoItem t JOIN Project p ON p.Id = t.ProjectId
      WHERE t.Id = ${itemId} AND ${activeRow(sql, "t")} AND ${activeRow(sql, "p")}
        AND (t.FolderId IS NULL OR EXISTS (
          SELECT 1 FROM Folder f WHERE f.Id = t.FolderId AND ${activeRow(sql, "f")}))`,
  });

  return { search, locate };
}
