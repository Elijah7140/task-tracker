import {
  archiveLookup,
  createItemType,
  createPriorityLevel,
  MetadataRuleError,
  priorityLabel,
  renameLookup,
  reorderLookups,
  restoreLookup,
  restorePriorityLevel,
  setPriorityNumber,
  type ItemType,
  type PriorityLevel,
} from "@task-tracker/core";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql";
import type { SqlError } from "effect/sql/SqlError";
import { lookupRepository } from "../db/repositories/lookup-repository.js";
import { Guid } from "../db/storage-codecs.js";
import type { UndoTable } from "../db/undo/undo-rows.js";
import { checkRules } from "./check-rules.js";
import { newId } from "./new-id.js";
import { operationTime } from "./operation-time.js";
import { UndoService, undoLabel } from "./undo-service.js";

type Lookup = ItemType | PriorityLevel;
type StorageError = SqlError | Schema.SchemaError;
const decodeId = Schema.decodeEffect(Guid);
const decodeIds = Schema.decodeEffect(Schema.Array(Guid));

interface LookupStore<Row extends Lookup> {
  readonly list: () => Effect.Effect<readonly Row[], StorageError>;
  readonly insert: (row: Row) => Effect.Effect<void, StorageError>;
  readonly update: (row: Row) => Effect.Effect<void, StorageError>;
}

/** How a lookup kind names its undo steps. Kinds without one record no history yet (WP51). */
interface LookupHistory<Row extends Lookup> {
  readonly table: UndoTable;
  readonly noun: string;
  readonly reorderLabel: string;
  readonly title: (row: Row) => string;
}

/** Creates a new row with a fresh id appended to the full list. */
type CreateLookup<Row extends Lookup> = (id: string, rows: readonly Row[]) => Row;

function manageLookups<Row extends Lookup>(
  sql: SqlClient.SqlClient,
  undo: UndoService["Service"],
  store: LookupStore<Row>,
  history?: LookupHistory<Row>,
) {
  const capture = (verb: string, row?: Row) => {
    if (history === undefined) {
      return Effect.void;
    }
    const where = row === undefined ? undefined : sql`Id = ${row.id}`;
    const label =
      row === undefined
        ? history.reorderLabel
        : undoLabel(`${verb} ${history.noun}`, history.title(row));
    return undo.capture(label, [{ table: history.table, ...(where && { where }) }]);
  };

  const add = Effect.fnUntraced(function* (create: CreateLookup<Row>) {
    const rows = yield* store.list();
    const now = yield* operationTime;
    const lookup = yield* checkRules(() => create(newId(now), rows));
    yield* capture("Add", lookup);
    yield* store.insert(lookup);
    return lookup;
  }, undo.record);

  const edit = Effect.fnUntraced(function* (
    id: string,
    verb: string,
    change: (row: Row, rows: readonly Row[]) => Row,
  ) {
    const key = yield* decodeId(id);
    const rows = yield* store.list();
    const row = rows.find((lookup) => lookup.id === key);
    if (row === undefined) {
      return yield* Effect.fail(new MetadataRuleError("Lookup was not found."));
    }
    const updated = yield* checkRules(() => change(row, rows));
    yield* capture(verb, updated);
    yield* store.update(updated);
  }, undo.record);

  const reorder = Effect.fnUntraced(function* (ids: readonly string[]) {
    const orderedIds = yield* decodeIds(ids);
    const rows = yield* store.list();
    const ordered = yield* checkRules(() => reorderLookups(rows, orderedIds));
    const positions = new Map(ordered.map((row) => [row.id, row.sortOrder]));
    yield* capture("Reorder");
    yield* Effect.forEach(
      rows,
      (row) => store.update({ ...row, sortOrder: positions.get(row.id) ?? row.sortOrder }),
      { discard: true },
    );
  }, undo.record);

  return {
    list: () => sql.withTransaction(store.list()),
    add,
    edit,
    rename: (id: string, name: string) =>
      edit(id, "Rename", (row, rows) => ({ ...row, ...renameLookup(row, name, rows) })),
    archive: (id: string) => edit(id, "Archive", (row) => ({ ...row, ...archiveLookup(row) })),
    restore: (id: string) => edit(id, "Restore", (row) => ({ ...row, ...restoreLookup(row) })),
    reorder,
  };
}

const priorityHistory: LookupHistory<PriorityLevel> = {
  table: "PriorityLevel",
  noun: "priority",
  reorderLabel: "Reorder priority levels",
  title: priorityLabel,
};

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const undo = yield* UndoService;
  const repository = lookupRepository(sql);
  const itemTypes = manageLookups(sql, undo, repository.itemTypes);
  const priorities = manageLookups(sql, undo, repository.priorityLevels, priorityHistory);
  return {
    itemTypes: {
      ...itemTypes,
      add: (name: string) => itemTypes.add((id, rows) => createItemType(id, name, rows)),
    },
    priorityLevels: {
      ...priorities,
      /** Adds a level at the bottom of the list. A numbered level may leave its name empty. */
      add: (name: string, number: number | null = null) =>
        priorities.add((id, rows) => createPriorityLevel(id, name, rows, number)),
      /** Sets or clears the display number. The number never affects rank. */
      setNumber: (id: string, number: number | null) =>
        priorities.edit(id, "Edit", (row, rows) => setPriorityNumber(row, number, rows)),
      restore: (id: string) => priorities.edit(id, "Restore", restorePriorityLevel),
    },
  };
});

/** Transactional management of item types and priority levels. */
export class LookupService extends Context.Service<LookupService>()(
  "@task-tracker/server/LookupService",
  { make },
) {
  static readonly layer = Layer.effect(this, make);
}
