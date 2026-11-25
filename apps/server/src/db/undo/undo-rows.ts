import { Effect } from "effect";
import { type Statement, SqlClient } from "effect/sql";

const keys = {
  Project: ["Id"],
  Folder: ["Id"],
  TodoItem: ["Id"],
  ItemFieldValue: ["ItemId", "FieldDefinitionId"],
  ItemLink: ["Id"],
  FieldDefinition: ["Id"],
  FieldChoice: ["Id"],
  PriorityLevel: ["Id"],
  StatusLevel: ["Id"],
  GlobalSetting: ["Key"],
  ProjectSetting: ["ProjectId", "Key"],
  SavedSearch: ["Id"],
  TicketListEntry: ["Id"],
  TicketDetail: ["ItemId"],
} as const;

/** User-data tables supported by the row recorder. Derived search data follows its triggers. */
export type UndoTable = keyof typeof keys;

/** Raw SQLite values preserve the storage representation of legacy rows. */
export type UndoRow = Readonly<Record<string, string | number | bigint | null>>;

/** Selects the rows a write may affect, including rows that might be inserted or removed. */
export interface UndoSource {
  readonly table: UndoTable;
  readonly where?: Statement.Fragment;
}

/** A logical row added, removed or modified by one operation. */
export interface UndoRowChange {
  readonly table: UndoTable;
  readonly before: UndoRow | undefined;
  readonly after: UndoRow | undefined;
}

/** Facts about a step that its rows alone cannot express. */
export interface UndoStepContext {
  /** Active projects whose effective automatic completion the recorded change turned on. */
  readonly autoCompletionEnabledProjects?: readonly string[];
}

export function hasUndoKey(table: string): table is UndoTable {
  return Object.hasOwn(keys, table);
}

/** Stable identity for persisted keys, including the two composite keys. */
export function rowKey(table: UndoTable, row: UndoRow): string {
  return JSON.stringify(keys[table].map((column) => row[column]));
}

/** Matches a recorded row, including soft-deleted rows. */
export function keyCondition(sql: SqlClient.SqlClient, table: UndoTable, row: UndoRow) {
  return sql.and(keys[table].map((column) => sql`${sql(column)} = ${row[column]}`));
}

/** Timestamp-only changes and reminder deliveries do not invalidate user history. */
export function sameUndoValues(left: UndoRow | undefined, right: UndoRow | undefined): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return Object.keys(left).every(
    (column) => column === "UpdatedAtUtc" || left[column] === right[column],
  );
}

type Snapshot = Map<string, { table: UndoTable; row: UndoRow }>;

/** Captures the selected rows once per transaction phase. */
export const snapshotRows = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  sources: readonly UndoSource[],
) {
  const snapshot: Snapshot = new Map();
  for (const { table, where = sql`1` } of sources) {
    const rows = yield* sql<UndoRow>`SELECT * FROM ${sql(table)} WHERE ${where}`.pipe(
      Effect.provideService(SqlClient.SafeIntegers, true),
    );
    for (const row of rows) {
      // Delivery ticks are operational bookkeeping and must survive an item edit replay.
      const { ReminderDeliveredFor: _delivery, ...values } = row;
      snapshot.set(`${table}:${rowKey(table, values)}`, { table, row: values });
    }
  }
  return snapshot;
});

/** Keeps only rows whose user data changed. */
export function changedRows(before: Snapshot, after: Snapshot): UndoRowChange[] {
  const changes: UndoRowChange[] = [];
  for (const [key, { table, row }] of before) {
    const next = after.get(key)?.row;
    if (!sameUndoValues(row, next)) {
      changes.push({ table, before: row, after: next });
    }
  }
  for (const [key, { table, row }] of after) {
    if (!before.has(key)) {
      changes.push({ table, before: undefined, after: row });
    }
  }
  return changes;
}

/** Selects the changed values without writing back keys or untouched columns. */
export function updateValues(table: UndoTable, source: UndoRow, target: UndoRow) {
  const identity: readonly string[] = keys[table];
  return Object.fromEntries(
    Object.entries(target).filter(
      ([column, value]) => !identity.includes(column) && source[column] !== value,
    ),
  );
}
