import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { addColumns, applyDdl } from "./apply-ddl.js";
import { rebuildItemTable, type SchemaObject } from "./rebuild-item-table.js";
import { reserveSearchKey } from "./reserve-search-key.js";

/**
 * The parent ticket's number as free text and the card's Detail override, null to follow
 * the global setting (§7.17, §7.19).
 */
export const ticketDetailCardColumns = [
  "ParentTicketNumber TEXT NULL",
  `ShowDetailOnCard INTEGER NULL
    CONSTRAINT CK_TicketDetail_ShowDetailOnCard CHECK (ShowDetailOnCard IS NULL OR ShowDetailOnCard IN (0, 1))`,
];

const itemTypeParts = [
  /\s*"ItemTypeId" TEXT NULL,/,
  /\s*CONSTRAINT "FK_TodoItem_ItemType_ItemTypeId" FOREIGN KEY \("ItemTypeId"\) REFERENCES "ItemType" \("Id"\) ON DELETE RESTRICT,/,
];

/** The TodoItem table definition without the item type column and its foreign key. */
export function withoutItemType(statement: string) {
  return itemTypeParts.reduce((table, part) => {
    if (!part.test(table)) {
      throw new Error(`TodoItem DDL no longer matches ${part.source}.`);
    }
    return table.replace(part, "");
  }, statement);
}

/** True for the schema objects that belong to the removed item types and comments. */
export function isRemovedSchemaObject(statement: string) {
  return (
    statement.startsWith('CREATE TABLE "ItemType"') ||
    statement.includes('"IX_ItemType_Name"') ||
    statement.includes('"IX_TodoItem_ItemTypeId"') ||
    statement.startsWith("CREATE TABLE TicketComment") ||
    statement.includes("IX_TicketComment_ItemId_CreatedAtUtc")
  );
}

/** Keeps every index and trigger except the item type index, which leaves with its column. */
const keepDependent = (object: SchemaObject) => object.name !== "IX_TodoItem_ItemTypeId";

/**
 * Reconciles the four-column search tables with the rebuilt items (§7.2): drops full-text
 * rows without a mapping and indexes any item that has no mapping or text row.
 */
const reconcileSearch = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`DELETE FROM TodoItemSearch
    WHERE rowid NOT IN (SELECT RowId FROM TodoItemSearchRow)`;
  yield* sql`INSERT INTO TodoItemSearchRow (ItemId)
    SELECT Id FROM TodoItem WHERE Id NOT IN (SELECT ItemId FROM TodoItemSearchRow)`;
  yield* sql`INSERT INTO TodoItemSearch (rowid, Title, Description, TicketNumber, Notes)
    SELECT mapping.RowId, item.Title, item.Description, item.TicketNumber, item.Notes
    FROM TodoItem item JOIN TodoItemSearchRow mapping ON mapping.ItemId = item.Id
    WHERE mapping.RowId NOT IN (SELECT rowid FROM TodoItemSearch)`;
});

/**
 * A ticket whose tree parent is a ticket takes that ticket's number as its parent ticket
 * number, so what Parent ticket showed before stays. Deleted rows are included, since
 * Trash can restore them.
 */
const fillParentTicketNumbers = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`INSERT INTO TicketDetail (ItemId, ParentTicketNumber)
    SELECT child.Id, parent.TicketNumber
    FROM TodoItem child JOIN TodoItem parent ON parent.Id = child.ParentItemId
    WHERE child.ItemKind = 'Ticket' AND parent.ItemKind = 'Ticket'
    ON CONFLICT (ItemId) DO UPDATE SET ParentTicketNumber = excluded.ParentTicketNumber`;
});

/**
 * The owner's 25 Nov 2026 ticket changes (§7.19, §12): ticket comments and item types are
 * removed with their stored data, and `TicketDetail` gains the free-text parent ticket
 * number and the card's Detail override. `TodoItem.ItemTypeId` has a foreign key and an
 * index, so the item table is rebuilt and the search tables reconciled. The new
 * `parentticket` search key is reserved as earlier ticket keys were.
 */
export default Effect.gen(function* () {
  yield* applyDdl(["DROP TABLE TicketComment"]);
  yield* addColumns("TicketDetail", ticketDetailCardColumns);
  yield* fillParentTicketNumbers;
  yield* rebuildItemTable({ reshape: withoutItemType, keepDependent, reconcileSearch });
  yield* applyDdl(["DROP TABLE ItemType"]);
  yield* reserveSearchKey("parentticket", true);
});
