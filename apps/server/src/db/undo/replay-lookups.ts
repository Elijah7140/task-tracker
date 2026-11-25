import {
  MetadataRuleError,
  renameLookup,
  setPriorityNumber,
  type PriorityLevel,
} from "@task-tracker/core";
import { Effect } from "effect";
import type { SqlClient } from "effect/sql";
import type { ReplayRow } from "./replay-rows.js";
import type { UndoRow } from "./undo-rows.js";

function lookupFromSnapshot(row: UndoRow) {
  return {
    id: String(row.Id),
    name: String(row.Name),
    colorKey: row.ColorKey === null ? null : String(row.ColorKey),
    isBuiltIn: row.IsBuiltIn === 1n,
    isArchived: row.IsArchived === 1n,
    sortOrder: Number(row.SortOrder),
  };
}

function priorityFromSnapshot(row: UndoRow): PriorityLevel {
  return {
    ...lookupFromSnapshot(row),
    number: row.Number === null ? null : Number(row.Number),
  };
}

/** How one lookup table's final list is read and checked. */
interface LookupList<Row extends PriorityLevel> {
  readonly table: "PriorityLevel";
  readonly kind: string;
  readonly fromSnapshot: (row: UndoRow) => Row;
  /** Throws the Core rule a row breaks in the final list, apart from rank. */
  readonly validate: (row: Row, rows: readonly Row[]) => void;
}

const priorityLevels: LookupList<PriorityLevel> = {
  table: "PriorityLevel",
  kind: "priority level",
  fromSnapshot: priorityFromSnapshot,
  validate: (row, rows) => {
    setPriorityNumber(row, row.number, rows);
    renameLookup(row, row.name, rows);
  },
};

/** Applies the Core name (and number) rules and unique ranks to the list replay would produce. */
function validateFinalList<Row extends PriorityLevel>(list: LookupList<Row>, rows: readonly Row[]) {
  const orders = new Set<number>();
  for (const row of rows) {
    list.validate(row, rows);
    if (orders.has(row.sortOrder)) {
      throw new MetadataRuleError(`Another ${list.kind} already uses the same rank.`);
    }
    orders.add(row.sortOrder);
  }
}

/** Builds the list replay would leave behind, in current row order. */
const proposedList = Effect.fnUntraced(function* <Row extends PriorityLevel>(
  sql: SqlClient.SqlClient,
  list: LookupList<Row>,
  changes: readonly ReplayRow[],
) {
  const current = yield* sql<UndoRow>`SELECT * FROM ${sql(list.table)} ORDER BY rowid`;
  const proposed = new Map(current.map(list.fromSnapshot).map((row) => [row.id, row]));
  for (const { source, target } of changes) {
    if (target === undefined) {
      proposed.delete(String(source?.Id));
    } else {
      proposed.set(String(target.Id), list.fromSnapshot(target));
    }
  }
  return [...proposed.values()];
});

const verifyList = Effect.fnUntraced(function* <Row extends PriorityLevel>(
  sql: SqlClient.SqlClient,
  list: LookupList<Row>,
  rows: readonly ReplayRow[],
) {
  const changes = rows.filter(({ table }) => table === list.table);
  if (changes.length === 0) {
    return;
  }
  const proposed = yield* proposedList(sql, list, changes);
  yield* Effect.try({
    try: () => validateFinalList(list, proposed),
    catch: (error) => {
      if (error instanceof MetadataRuleError) {
        return error;
      }
      throw error;
    },
  });
});

/**
 * Checks the final priority list before replay writes encounter SQLite's
 * unique indexes: Unicode-aware names including archived ones, active numbers and ranks.
 */
export const verifyReplayLookups = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  rows: readonly ReplayRow[],
) {
  yield* verifyList(sql, priorityLevels, rows);
});
