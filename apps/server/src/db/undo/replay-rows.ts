import { MetadataRuleError, type UndoDirection } from "@task-tracker/core";
import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import {
  hasUndoKey,
  keyCondition,
  rowKey,
  sameUndoValues,
  updateValues,
  type UndoRow,
  type UndoRowChange,
  type UndoStepContext,
  type UndoTable,
} from "./undo-rows.js";
import { verifyReplayCompletion } from "./replay-completion.js";
import { verifyReplayFieldValues } from "./replay-field-values.js";
import { verifyReplayFields } from "./replay-fields.js";
import { verifyReplayHierarchy } from "./replay-hierarchy.js";
import { verifyReplayLookups } from "./replay-lookups.js";
import { verifyReplaySavedSearches } from "./replay-saved-searches.js";
import { verifyReplaySettings } from "./replay-settings.js";
import { verifyReplayStatuses } from "./replay-statuses.js";

/** The expected and desired versions of a row in the selected replay direction. */
export interface ReplayRow {
  readonly table: UndoTable;
  readonly source: UndoRow | undefined;
  readonly target: UndoRow | undefined;
}

const subjects: Partial<Record<UndoTable, string>> = {
  Project: "project",
  Folder: "folder",
  ItemType: "item type",
  PriorityLevel: "priority level",
  StatusLevel: "status",
  FieldDefinition: "field",
  FieldChoice: "field choice",
  GlobalSetting: "setting",
  ProjectSetting: "setting",
  SavedSearch: "saved search",
};

const subject = (table: UndoTable) => subjects[table] ?? "item";

/** Explains which kind of dependent row blocks a hard delete during replay. */
const removalRefusal = (table: UndoTable, direction: UndoDirection) =>
  table === "StatusLevel"
    ? `This status is still used by an item; can't ${direction} its addition.`
    : `Other data still depends on this ${subject(table)}; can't ${direction} its removal.`;

const verifyRow = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  { table, source, target }: ReplayRow,
  direction: UndoDirection,
) {
  const [current] = yield* sql<UndoRow>`
    SELECT * FROM ${sql(table)} WHERE ${keyCondition(sql, table, (source ?? target)!)}
  `;
  if (!sameUndoValues(source, current)) {
    const reason = current === undefined ? "was permanently deleted" : "changed";
    return yield* Effect.fail(
      new MetadataRuleError(`This ${subject(table)} ${reason} since; can't ${direction}.`),
    );
  }
});

interface ForeignKeyColumn {
  readonly dependent: string;
  readonly constraintId: number;
  readonly childColumn: string;
  readonly parentColumn: string;
}

const referencingKeys = (sql: SqlClient.SqlClient, table: UndoTable) =>
  sql<ForeignKeyColumn>`
    SELECT entity.name AS dependent, fk.id AS constraintId,
           fk."from" AS childColumn, fk."to" AS parentColumn
      FROM sqlite_schema AS entity JOIN pragma_foreign_key_list(entity.name) AS fk
     WHERE entity.type = 'table' AND fk."table" = ${table}
       AND entity.name <> 'TodoItemSearchRow'
     ORDER BY entity.name, fk.id, fk.seq
  `;

const verifyRemoval = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  table: UndoTable,
  source: UndoRow,
  removals: ReadonlySet<string>,
  direction: UndoDirection,
) {
  const keys = Object.groupBy(
    yield* referencingKeys(sql, table),
    (column) => `${column.dependent}:${column.constraintId}`,
  );
  for (const columns of Object.values(keys)) {
    const dependent = columns![0]!.dependent;
    const condition = sql.and(
      columns!.map(
        ({ childColumn, parentColumn }) => sql`${sql(childColumn)} = ${source[parentColumn]}`,
      ),
    );
    const rows = yield* sql<UndoRow>`SELECT * FROM ${sql(dependent)} WHERE ${condition}`;
    if (
      rows.some(
        (row) => !hasUndoKey(dependent) || !removals.has(`${dependent}:${rowKey(dependent, row)}`),
      )
    ) {
      return yield* Effect.fail(new MetadataRuleError(removalRefusal(table, direction)));
    }
  }
});

const writeRow = (sql: SqlClient.SqlClient, { table, source, target }: ReplayRow) => {
  if (target === undefined) {
    return sql`DELETE FROM ${sql(table)} WHERE ${keyCondition(sql, table, source!)}`;
  }
  if (source === undefined) {
    return sql`INSERT INTO ${sql(table)} ${sql.insert(target)}`;
  }
  return sql`UPDATE ${sql(table)} SET ${sql.update(updateValues(table, source, target))}
    WHERE ${keyCondition(sql, table, source)}`;
};

/**
 * Verifies every source row before changing any data, then checks the written state against
 * current rules inside the same transaction. Derived data is left to SQLite.
 */
export const replayRows = Effect.fnUntraced(
  function* (
    sql: SqlClient.SqlClient,
    changes: readonly UndoRowChange[],
    direction: UndoDirection,
    context: UndoStepContext = {},
  ) {
    const rows: ReplayRow[] = changes.map(({ table, before, after }) => ({
      table,
      source: direction === "undo" ? after : before,
      target: direction === "undo" ? before : after,
    }));
    for (const row of rows) {
      yield* verifyRow(sql, row, direction);
    }
    yield* verifyReplayLookups(sql, rows);
    yield* verifyReplayFields(sql, rows);
    const turnedOn = yield* verifyReplaySettings(
      sql,
      rows,
      context.autoCompletionEnabledProjects ?? [],
      direction,
    );
    const removed = rows.filter((row) => row.target === undefined);
    const removals = new Set(
      removed.map(({ table, source }) => `${table}:${rowKey(table, source!)}`),
    );
    for (const { table, source } of removed) {
      yield* verifyRemoval(sql, table, source!, removals, direction);
    }
    // Restored subtrees and composite references may temporarily point to another row in the step.
    yield* sql`PRAGMA defer_foreign_keys = ON`;
    for (const row of rows) {
      yield* writeRow(sql, row);
    }
    yield* verifyReplayHierarchy(sql, rows);
    yield* verifyReplayStatuses(sql, rows, direction);
    yield* verifyReplayFieldValues(sql, rows, direction);
    yield* verifyReplayCompletion(sql, rows, turnedOn);
    yield* verifyReplaySavedSearches(sql, rows, direction);
  },
  (effect) => effect.pipe(Effect.provideService(SqlClient.SafeIntegers, true)),
);
