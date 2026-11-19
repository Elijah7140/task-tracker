import {
  archiveLookup,
  createItemType,
  createPriorityLevel,
  MetadataRuleError,
  renameLookup,
  reorderLookups,
  restoreLookup,
  type ItemType,
  type LookupEntity,
  type PriorityLevel,
} from "@task-tracker/core";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql";
import type { SqlError } from "effect/sql/SqlError";
import { lookupRepository } from "../db/repositories/lookup-repository.js";
import { Guid } from "../db/storage-codecs.js";
import { checkRules } from "./check-rules.js";
import { newId } from "./new-id.js";
import { operationTime } from "./operation-time.js";

type Lookup = ItemType | PriorityLevel;
type StorageError = SqlError | Schema.SchemaError;
const decodeId = Schema.decodeEffect(Guid);
const decodeIds = Schema.decodeEffect(Schema.Array(Guid));

function manageLookups<Row extends Lookup>(
  sql: SqlClient.SqlClient,
  repository: {
    list: () => Effect.Effect<readonly Row[], StorageError>;
    insert: (row: Row) => Effect.Effect<void, StorageError>;
    update: (row: LookupEntity) => Effect.Effect<void, StorageError>;
  },
  create: (id: string, name: string, rows: readonly Row[]) => Row,
) {
  const add = Effect.fnUntraced(function* (name: string) {
    const rows = yield* repository.list();
    const now = yield* operationTime;
    const lookup = yield* checkRules(() => create(newId(now), name, rows));
    yield* repository.insert(lookup);
    return lookup;
  }, sql.withTransaction);

  const edit = Effect.fnUntraced(function* (
    id: string,
    change: (row: Row, rows: readonly Row[]) => LookupEntity,
  ) {
    const key = yield* decodeId(id);
    const rows = yield* repository.list();
    const row = rows.find((lookup) => lookup.id === key);
    if (row === undefined) {
      return yield* Effect.fail(new MetadataRuleError("Lookup was not found."));
    }
    const updated = yield* checkRules(() => change(row, rows));
    yield* repository.update(updated);
  }, sql.withTransaction);

  const reorder = Effect.fnUntraced(function* (ids: readonly string[]) {
    const orderedIds = yield* decodeIds(ids);
    const rows = yield* repository.list();
    const ordered = yield* checkRules(() => reorderLookups(rows, orderedIds));
    yield* Effect.forEach(ordered, repository.update, { discard: true });
  }, sql.withTransaction);

  return {
    list: () => sql.withTransaction(repository.list()),
    add,
    rename: (id: string, name: string) => edit(id, (row, rows) => renameLookup(row, name, rows)),
    archive: (id: string) => edit(id, archiveLookup),
    restore: (id: string) => edit(id, restoreLookup),
    reorder,
  };
}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const repository = lookupRepository(sql);
  return {
    itemTypes: manageLookups(sql, repository.itemTypes, createItemType),
    priorityLevels: manageLookups(sql, repository.priorityLevels, createPriorityLevel),
  };
});

/** Transactional management of item types and priority levels. */
export class LookupService extends Context.Service<LookupService>()(
  "@task-tracker/server/LookupService",
  { make },
) {
  static readonly layer = Layer.effect(this, make);
}
