import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { addColumns, applyDdl } from "./apply-ddl.js";
import { itemSearchSchema } from "./add-item-search.js";

/** Every item's Markdown notes, kept apart from a ticket's Detail in `Description` (§7.19). */
export const itemNotesColumns = ["Notes TEXT NULL"];

/** The full-text table and its maintenance triggers from stage 16 on, with Notes indexed (§7.2). */
export const itemSearchSchemaWithNotes = [
  itemSearchSchema[0]!,
  `CREATE VIRTUAL TABLE TodoItemSearch USING fts5(Title, Description, TicketNumber, Notes,
    tokenize='unicode61 remove_diacritics 2')`,
  `CREATE TRIGGER TodoItemSearch_Insert AFTER INSERT ON TodoItem BEGIN
    INSERT INTO TodoItemSearchRow(ItemId) VALUES (new.Id);
    INSERT INTO TodoItemSearch(rowid, Title, Description, TicketNumber, Notes)
    VALUES (last_insert_rowid(), new.Title, new.Description, new.TicketNumber, new.Notes); END`,
  itemSearchSchema[3]!,
  itemSearchSchema[4]!,
  `CREATE TRIGGER TodoItemSearch_Update AFTER UPDATE OF Title, Description, TicketNumber, Notes ON TodoItem BEGIN
    DELETE FROM TodoItemSearch WHERE rowid = (SELECT RowId FROM TodoItemSearchRow WHERE ItemId = new.Id);
    INSERT INTO TodoItemSearch(rowid, Title, Description, TicketNumber, Notes)
    SELECT RowId, new.Title, new.Description, new.TicketNumber, new.Notes FROM TodoItemSearchRow WHERE ItemId = new.Id; END`,
];

/** The shadow tables SQLite creates for the four-column full-text table. */
export const searchShadowSchemaWithNotes = [
  `CREATE TABLE 'TodoItemSearch_data'(id INTEGER PRIMARY KEY, block BLOB)`,
  `CREATE TABLE 'TodoItemSearch_idx'(segid, term, pgno, PRIMARY KEY(segid, term)) WITHOUT ROWID`,
  `CREATE TABLE 'TodoItemSearch_content'(id INTEGER PRIMARY KEY, c0, c1, c2, c3)`,
  `CREATE TABLE 'TodoItemSearch_docsize'(id INTEGER PRIMARY KEY, sz BLOB)`,
  `CREATE TABLE 'TodoItemSearch_config'(k PRIMARY KEY, v) WITHOUT ROWID`,
];

/** Statements of the new search schema that this migration creates. */
const rebuiltSearchStatements = [
  itemSearchSchemaWithNotes[1]!,
  itemSearchSchemaWithNotes[2]!,
  itemSearchSchemaWithNotes[5]!,
];

/** Drops the full-text table and the two triggers that name its columns; the row mapping stays. */
const dropSearchIndex = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`DROP TRIGGER TodoItemSearch_Insert`;
  yield* sql`DROP TRIGGER TodoItemSearch_Update`;
  yield* sql`DROP TABLE TodoItemSearch`;
});

/** Indexes every item, including soft-deleted rows, under its existing mapping row ID. */
const reindexItems = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`INSERT INTO TodoItemSearch (rowid, Title, Description, TicketNumber, Notes)
    SELECT mapping.RowId, item.Title, item.Description, item.TicketNumber, item.Notes
    FROM TodoItem item JOIN TodoItemSearchRow mapping ON mapping.ItemId = item.Id`;
});

/**
 * Adds `TodoItem.Notes` (§7.19). A ToDo's `Description` was its notes, so its text moves
 * to Notes and its Description is cleared; a ticket's Description stays as its Detail.
 * The full-text table is rebuilt with a Notes column and reindexed (§7.2).
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* addColumns("TodoItem", itemNotesColumns);
  yield* dropSearchIndex;
  yield* sql`UPDATE TodoItem SET Notes = Description, Description = NULL WHERE ItemKind = 'Todo'`;
  yield* applyDdl(rebuiltSearchStatements);
  yield* reindexItems;
});
