import { Effect, Option, Schema } from "effect";
import { SqlSchema, type SqlClient } from "effect/sql";
import { Bit, Guid } from "../storage-codecs.js";

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
  parentTicketNumber: Schema.NullOr(Schema.String),
  showDetailOnCard: Schema.NullOr(Bit),
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
    parentTicketNumber: "ParentTicketNumber",
    showDetailOnCard: "ShowDetailOnCard",
  }),
);

/** A ticket's own choice about showing its Detail on its card (§7.17). */
const CardOverrideRow = Schema.Struct({ itemId: Guid, showDetailOnCard: Bit });

const AreaRequest = Schema.Struct({ projectId: Guid, folderId: Schema.NullOr(Guid) });

/** Where an item found by its ticket number lives (§7.19). */
const TicketLocationRow = Schema.Struct({
  itemId: Guid,
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
  title: Schema.String,
});

/** Reads and writes a ticket's fixed fields on the caller's transaction. */
export function ticketDetailRepository(sql: SqlClient.SqlClient) {
  const find = SqlSchema.findOneOption({
    Request: Guid,
    Result: TicketDetailRow,
    execute: (itemId) => sql`SELECT * FROM TicketDetail WHERE ItemId = ${itemId}`,
  });
  const findByNumber = SqlSchema.findOneOption({
    Request: Schema.String,
    Result: TicketLocationRow,
    execute: (ticketNumber) => sql`
      SELECT i.Id AS itemId, i.ProjectId AS projectId, i.FolderId AS folderId, i.Title AS title
      FROM TodoItem i
      JOIN Project p ON p.Id = i.ProjectId AND p.DeletedAtUtc IS NULL
      LEFT JOIN Folder f ON f.Id = i.FolderId
      WHERE i.DeletedAtUtc IS NULL AND (i.FolderId IS NULL OR f.DeletedAtUtc IS NULL)
        AND i.TicketNumber = ${ticketNumber} COLLATE NOCASE
      ORDER BY i.ItemKind = 'Ticket' DESC, i.UpdatedAtUtc DESC, i.rowid DESC
      LIMIT 1`,
  });
  return {
    /** The ticket's stored fields, or null when none were ever saved. */
    find: (itemId: string) => find(itemId).pipe(Effect.map(Option.getOrNull)),
    upsert: SqlSchema.void({
      Request: TicketDetailRow,
      execute: (row) => sql`INSERT INTO TicketDetail ${sql.insert(row)}
        ON CONFLICT (ItemId) DO UPDATE SET ${sql.update(row, ["ItemId"])}`,
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
    /** The card Detail choices of the area's tickets that do not follow the setting (§7.17). */
    listCardOverrides: SqlSchema.findAll({
      Request: AreaRequest,
      Result: CardOverrideRow,
      execute: ({ projectId, folderId }) => sql`
        SELECT detail.ItemId AS itemId, detail.ShowDetailOnCard AS showDetailOnCard
        FROM TicketDetail AS detail JOIN TodoItem AS item ON item.Id = detail.ItemId
        WHERE item.ProjectId = ${projectId} AND item.FolderId IS ${folderId}
          AND item.DeletedAtUtc IS NULL AND detail.ShowDetailOnCard IS NOT NULL`,
    }),
    /**
     * The active item with this ticket number, ignoring case: a ticket before a ToDo, then
     * the most recently updated. Null when Task Tracker holds none (§7.19).
     */
    findByTicketNumber: (ticketNumber: string) =>
      findByNumber(ticketNumber).pipe(Effect.map(Option.getOrNull)),
  };
}
