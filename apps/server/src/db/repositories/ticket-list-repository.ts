import { Schema } from "effect";
import { SqlSchema, type SqlClient } from "effect/sql";
import { Bit, Guid } from "../storage-codecs.js";

/** A TicketListEntry row (§7.19). */
const TicketListEntryRow = Schema.Struct({
  id: Guid,
  listKind: Schema.Literals(["Person", "TicketType", "Application", "Module", "Interface"]),
  parentId: Schema.NullOr(Guid),
  name: Schema.String,
  isArchived: Bit,
  sortOrder: Schema.Int,
}).pipe(
  Schema.encodeKeys({
    id: "Id",
    listKind: "ListKind",
    parentId: "ParentId",
    name: "Name",
    isArchived: "IsArchived",
    sortOrder: "SortOrder",
  }),
);

/** Reads every ticket list entry and writes one entry at a time, on the caller's transaction. */
export function ticketListRepository(sql: SqlClient.SqlClient) {
  const list = SqlSchema.findAll({
    Request: Schema.Void,
    Result: TicketListEntryRow,
    execute: () => sql`SELECT * FROM TicketListEntry ORDER BY ListKind, SortOrder, rowid`,
  });
  return {
    list: () => list(undefined),
    insert: SqlSchema.void({
      Request: TicketListEntryRow,
      execute: (row) => sql`INSERT INTO TicketListEntry ${sql.insert(row)}`,
    }),
    /** Writes the editable columns. The list and parent never change. */
    update: SqlSchema.void({
      Request: TicketListEntryRow,
      execute: ({ Id, Name, IsArchived, SortOrder }) =>
        sql`UPDATE TicketListEntry SET Name = ${Name}, IsArchived = ${IsArchived},
          SortOrder = ${SortOrder} WHERE Id = ${Id}`,
    }),
  };
}
