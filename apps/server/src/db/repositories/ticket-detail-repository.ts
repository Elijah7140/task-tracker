import { Effect, Option, Schema } from "effect";
import { SqlSchema, type SqlClient } from "effect/sql";
import { Bit, Guid, Real, UtcTimestamp } from "../storage-codecs.js";

const optionalId = Schema.NullOr(Guid);

/** A TicketDetail row (§7.19). */
const TicketDetailRow = Schema.Struct({
  itemId: Guid,
  requestorId: optionalId,
  applicationId: optionalId,
  moduleId: optionalId,
  interfaceId: optionalId,
  dispatchedToId: optionalId,
  pendingPersonId: optionalId,
  ticketTypeId: optionalId,
  version: Schema.NullOr(Schema.String),
  estimatedHours: Schema.NullOr(Real),
  percentComplete: Schema.NullOr(Schema.Int),
  isUrgent: Bit,
  isSystemOutage: Bit,
}).pipe(
  Schema.encodeKeys({
    itemId: "ItemId",
    requestorId: "RequestorId",
    applicationId: "ApplicationId",
    moduleId: "ModuleId",
    interfaceId: "InterfaceId",
    dispatchedToId: "DispatchedToId",
    pendingPersonId: "PendingPersonId",
    ticketTypeId: "TicketTypeId",
    version: "Version",
    estimatedHours: "EstimatedHours",
    percentComplete: "PercentComplete",
    isUrgent: "IsUrgent",
    isSystemOutage: "IsSystemOutage",
  }),
);

/** A TicketComment row (§7.19). */
const TicketCommentRow = Schema.Struct({
  id: Guid,
  itemId: Guid,
  body: Schema.String,
  createdAtUtc: UtcTimestamp,
}).pipe(
  Schema.encodeKeys({ id: "Id", itemId: "ItemId", body: "Body", createdAtUtc: "CreatedAtUtc" }),
);

/** Reads and writes a ticket's fixed fields and comment log on the caller's transaction. */
export function ticketDetailRepository(sql: SqlClient.SqlClient) {
  const find = SqlSchema.findOneOption({
    Request: Guid,
    Result: TicketDetailRow,
    execute: (itemId) => sql`SELECT * FROM TicketDetail WHERE ItemId = ${itemId}`,
  });
  return {
    /** The ticket's stored fields, or null when none were ever saved. */
    find: (itemId: string) => find(itemId).pipe(Effect.map(Option.getOrNull)),
    upsert: SqlSchema.void({
      Request: TicketDetailRow,
      execute: (row) => sql`INSERT INTO TicketDetail ${sql.insert(row)}
        ON CONFLICT (ItemId) DO UPDATE SET ${sql.update(row, ["ItemId"])}`,
    }),
    /** The comment log, newest first. */
    listComments: SqlSchema.findAll({
      Request: Guid,
      Result: TicketCommentRow,
      execute: (itemId) => sql`SELECT * FROM TicketComment WHERE ItemId = ${itemId}
        ORDER BY CreatedAtUtc DESC, rowid DESC`,
    }),
    /** The fixed fields of the project's active tickets, for export (§7.9, §7.19). */
    listForActiveItems: SqlSchema.findAll({
      Request: Guid,
      Result: TicketDetailRow,
      execute: (projectId) => sql`SELECT detail.* FROM TicketDetail AS detail
        JOIN TodoItem AS item ON item.Id = detail.ItemId
        WHERE item.ProjectId = ${projectId} AND item.DeletedAtUtc IS NULL
        ORDER BY detail.rowid`,
    }),
    /** The comments of the project's active tickets, oldest first, for export. */
    listCommentsForActiveItems: SqlSchema.findAll({
      Request: Guid,
      Result: TicketCommentRow,
      execute: (projectId) => sql`SELECT comment.* FROM TicketComment AS comment
        JOIN TodoItem AS item ON item.Id = comment.ItemId
        WHERE item.ProjectId = ${projectId} AND item.DeletedAtUtc IS NULL
        ORDER BY comment.CreatedAtUtc, comment.rowid`,
    }),
    insertComment: SqlSchema.void({
      Request: TicketCommentRow,
      execute: (row) => sql`INSERT INTO TicketComment ${sql.insert(row)}`,
    }),
  };
}
