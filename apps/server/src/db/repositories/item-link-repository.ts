import { Schema } from "effect";
import { SqlSchema, type SqlClient } from "effect/sql";
import { Guid, UtcTimestamp } from "../storage-codecs.js";

const columns = {
  id: "Id",
  itemId: "ItemId",
  url: "Url",
  title: "Title",
  sortOrder: "SortOrder",
  createdAtUtc: "CreatedAtUtc",
} as const;

/** An ItemLink row with the EF column names. */
const ItemLinkRow = Schema.Struct({
  id: Guid,
  itemId: Guid,
  url: Schema.String,
  title: Schema.NullOr(Schema.String),
  sortOrder: Schema.Int,
  createdAtUtc: UtcTimestamp,
}).pipe(Schema.encodeKeys(columns));

/** Persists an item's ordered links in the caller's transaction. */
export function itemLinkRepository(sql: SqlClient.SqlClient) {
  return {
    list: SqlSchema.findAll({
      Request: Guid,
      Result: ItemLinkRow,
      execute: (itemId) =>
        sql`SELECT * FROM ItemLink WHERE ItemId = ${itemId} ORDER BY SortOrder, rowid`,
    }),
    /** Every link of the project's active items, for export (§7.9). */
    listForActiveItems: SqlSchema.findAll({
      Request: Guid,
      Result: ItemLinkRow,
      execute: (projectId) => sql`SELECT link.* FROM ItemLink AS link
        JOIN TodoItem AS item ON item.Id = link.ItemId
        WHERE item.ProjectId = ${projectId} AND item.DeletedAtUtc IS NULL
        ORDER BY link.SortOrder, link.rowid`,
    }),
    insert: SqlSchema.void({
      Request: ItemLinkRow,
      execute: (row) => sql`INSERT INTO ItemLink ${sql.insert(row)}`,
    }),
    update: SqlSchema.void({
      Request: ItemLinkRow,
      execute: ({ Id, Url, Title, SortOrder }) =>
        sql`UPDATE ItemLink SET Url = ${Url}, Title = ${Title}, SortOrder = ${SortOrder}
          WHERE Id = ${Id}`,
    }),
    remove: SqlSchema.void({
      Request: Guid,
      execute: (id) => sql`DELETE FROM ItemLink WHERE Id = ${id}`,
    }),
  };
}
