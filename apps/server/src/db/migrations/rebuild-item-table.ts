import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { applyDdl } from "./apply-ddl.js";

/** A stored index or trigger definition. */
export type SchemaObject = { type: string; name: string; tableName: string; sql: string };

/**
 * Indexes and triggers to recreate: those on TodoItem go with the table, and
 * those elsewhere that name it would stop the rename while TodoItem is missing.
 */
const readDependents = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql<SchemaObject>`
    SELECT type, name, tbl_name AS tableName, sql FROM sqlite_schema
    WHERE type IN ('index', 'trigger') AND sql IS NOT NULL
      AND (tbl_name = 'TodoItem' OR instr(sql, 'TodoItem') > 0)
    ORDER BY type, name`;
});

/** Tables whose rows reference an item, including the search mapping (§7.2). */
const readChildTables = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ name: string }>`
    SELECT DISTINCT m.name FROM sqlite_schema m, pragma_foreign_key_list(m.name) f
    WHERE m.type = 'table' AND f."table" = 'TodoItem'
      AND m.name <> 'TodoItem'
    ORDER BY m.name`;
  return rows.map((row) => row.name);
});

/** Copies every item into the reshaped table without parents, which still point at the old table. */
const copyItems = Effect.fnUntraced(function* (reshape: (statement: string) => string) {
  const sql = yield* SqlClient.SqlClient;
  const [table] = yield* sql<{ sql: string }>`
    SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'TodoItem'`;
  yield* sql.unsafe(
    reshape(table!.sql).replace(/^CREATE TABLE "TodoItem"/, 'CREATE TABLE "TodoItem_new"'),
  );
  const columns = yield* sql<{ name: string }>`SELECT name FROM pragma_table_info('TodoItem_new')`;
  const list = columns.map(({ name }) => `"${name}"`).join(", ");
  yield* sql.unsafe(`INSERT INTO TodoItem_new (${list}) SELECT ${list} FROM TodoItem`);
  yield* sql`UPDATE TodoItem_new SET ParentItemId = NULL`;
});

/** Drops the dependents on other tables; those on TodoItem go with the table. */
const dropOutsideDependents = Effect.fnUntraced(function* (dependents: readonly SchemaObject[]) {
  const sql = yield* SqlClient.SqlClient;
  for (const { type, name } of dependents.filter((object) => object.tableName !== "TodoItem")) {
    yield* sql.unsafe(`DROP ${type.toUpperCase()} "${name}"`);
  }
});

/**
 * Moves child rows aside so dropping TodoItem neither cascades nor restricts.
 * The mapping keeps its row IDs, so the full-text rows stay valid untouched.
 */
const stashChildren = Effect.fnUntraced(function* (tables: readonly string[]) {
  const sql = yield* SqlClient.SqlClient;
  for (const table of tables) {
    yield* sql.unsafe(`CREATE TEMP TABLE "Stash_${table}" AS SELECT * FROM "${table}"`);
    yield* sql.unsafe(`DELETE FROM "${table}"`);
  }
});

const restoreChildren = Effect.fnUntraced(function* (tables: readonly string[]) {
  const sql = yield* SqlClient.SqlClient;
  for (const table of tables) {
    yield* sql.unsafe(`INSERT INTO "${table}" SELECT * FROM temp."Stash_${table}"`);
    yield* sql.unsafe(`DROP TABLE temp."Stash_${table}"`);
  }
});

/** Replaces TodoItem with the copy, keeping parents in a temporary table across the swap. */
const swapTables = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TEMP TABLE Stash_Parent AS
    SELECT Id, ParentItemId FROM TodoItem WHERE ParentItemId IS NOT NULL`;
  yield* sql`UPDATE TodoItem SET ParentItemId = NULL`;
  yield* sql`DROP TABLE TodoItem`;
  yield* sql`ALTER TABLE TodoItem_new RENAME TO TodoItem`;
  yield* sql`UPDATE TodoItem SET ParentItemId =
    (SELECT ParentItemId FROM temp.Stash_Parent parent WHERE parent.Id = TodoItem.Id)
    WHERE Id IN (SELECT Id FROM temp.Stash_Parent)`;
  yield* sql`DROP TABLE temp.Stash_Parent`;
});

/** How a migration reshapes the item table. */
export interface ItemTableRebuild {
  /** Turns the stored `CREATE TABLE "TodoItem"` statement into the new one. */
  readonly reshape: (statement: string) => string;
  /** Keeps an index or trigger; those it drops are not recreated. Defaults to keeping all. */
  readonly keepDependent?: (object: SchemaObject) => boolean;
  /** Reconciles the search tables with the rebuilt items (§7.2). */
  readonly reconcileSearch: Effect.Effect<void, unknown, SqlClient.SqlClient>;
}

/**
 * Rebuilds TodoItem when SQLite cannot alter it in place, as when a dropped column has a
 * check, a foreign key or an index. Foreign keys stay on inside the migration transaction,
 * so items are copied, child rows set aside, the old table dropped and the copy renamed,
 * then indexes, triggers (the search triggers among them) and children come back and the
 * search tables are reconciled.
 */
export const rebuildItemTable = Effect.fnUntraced(function* (rebuild: ItemTableRebuild) {
  const keep = rebuild.keepDependent ?? (() => true);
  const dependents = yield* readDependents;
  const children = yield* readChildTables;
  yield* copyItems(rebuild.reshape);
  yield* dropOutsideDependents(dependents);
  yield* stashChildren(children);
  yield* swapTables;
  yield* applyDdl(dependents.filter(keep).map((object) => object.sql));
  yield* restoreChildren(children);
  yield* rebuild.reconcileSearch;
});
