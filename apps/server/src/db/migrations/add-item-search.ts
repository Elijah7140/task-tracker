import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { applyDdl } from "./apply-ddl.js";
import { reserveSearchKey } from "./reserve-search-key.js";

/** The FTS table, its stable row ID mapping and transaction-local maintenance triggers. */
export const itemSearchSchema = [
  `CREATE TABLE TodoItemSearchRow (RowId INTEGER PRIMARY KEY AUTOINCREMENT,
    ItemId TEXT NOT NULL UNIQUE REFERENCES TodoItem(Id) ON DELETE CASCADE)`,
  `CREATE VIRTUAL TABLE TodoItemSearch USING fts5(Title, Description, TicketNumber,
    tokenize='unicode61 remove_diacritics 2')`,
  `CREATE TRIGGER TodoItemSearch_Insert AFTER INSERT ON TodoItem BEGIN
    INSERT INTO TodoItemSearchRow(ItemId) VALUES (new.Id);
    INSERT INTO TodoItemSearch(rowid, Title, Description, TicketNumber)
    VALUES (last_insert_rowid(), new.Title, new.Description, new.TicketNumber); END`,
  `CREATE TRIGGER TodoItemSearch_Delete AFTER DELETE ON TodoItem BEGIN
    DELETE FROM TodoItemSearch WHERE rowid = (SELECT RowId FROM TodoItemSearchRow WHERE ItemId = old.Id);
    DELETE FROM TodoItemSearchRow WHERE ItemId = old.Id; END`,
  // The mapping cascade can run before TodoItem's AFTER DELETE trigger.
  `CREATE TRIGGER TodoItemSearchRow_Delete AFTER DELETE ON TodoItemSearchRow BEGIN
    DELETE FROM TodoItemSearch WHERE rowid = old.RowId; END`,
  `CREATE TRIGGER TodoItemSearch_Update AFTER UPDATE OF Title, Description, TicketNumber ON TodoItem BEGIN
    DELETE FROM TodoItemSearch WHERE rowid = (SELECT RowId FROM TodoItemSearchRow WHERE ItemId = new.Id);
    INSERT INTO TodoItemSearch(rowid, Title, Description, TicketNumber)
    SELECT RowId, new.Title, new.Description, new.TicketNumber FROM TodoItemSearchRow WHERE ItemId = new.Id; END`,
];

/** SQLite creates these shadow tables when it creates the FTS5 virtual table. */
export const searchShadowSchema = [
  `CREATE TABLE 'TodoItemSearch_data'(id INTEGER PRIMARY KEY, block BLOB)`,
  `CREATE TABLE 'TodoItemSearch_idx'(segid, term, pgno, PRIMARY KEY(segid, term)) WITHOUT ROWID`,
  `CREATE TABLE 'TodoItemSearch_content'(id INTEGER PRIMARY KEY, c0, c1, c2)`,
  `CREATE TABLE 'TodoItemSearch_docsize'(id INTEGER PRIMARY KEY, sz BLOB)`,
  `CREATE TABLE 'TodoItemSearch_config'(k PRIMARY KEY, v) WITHOUT ROWID`,
];

/** Installs full-text search and indexes every existing item, including soft-deleted rows. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  for (const key of ["title", "ticket", "type", "priority", "due", "scheduled", "status"]) {
    yield* reserveSearchKey(key, false);
  }
  yield* applyDdl(itemSearchSchema);
  yield* sql`INSERT INTO TodoItemSearchRow (ItemId) SELECT Id FROM TodoItem`;
  yield* sql`INSERT INTO TodoItemSearch (rowid, Title, Description, TicketNumber)
    SELECT mapping.RowId, item.Title, item.Description, item.TicketNumber
    FROM TodoItem item JOIN TodoItemSearchRow mapping ON mapping.ItemId = item.Id`;
});
