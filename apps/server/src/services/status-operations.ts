import {
  createStatus,
  MetadataRuleError,
  renameStatus,
  reorderStatuses,
  setStatusArchived,
  type StatusKind,
  type StatusLevel,
} from "@task-tracker/core";
import { Effect, Schema } from "effect";
import type { SqlClient } from "effect/sql";
import { statusRepository } from "../db/repositories/status-repository.js";
import { Guid } from "../db/storage-codecs.js";
import { checkRules } from "./check-rules.js";
import { newId } from "./new-id.js";
import { operationTime } from "./operation-time.js";
import { UndoService, undoLabel } from "./undo-service.js";

/** Manage workflow statuses with one undoable transaction per mutation. */
export const statusOperations = Effect.fnUntraced(function* (sql: SqlClient.SqlClient) {
  const undo = yield* UndoService;
  const repository = statusRepository(sql);
  const decodeId = Schema.decodeEffect(Guid);
  const decodeIds = Schema.decodeEffect(Schema.Array(Guid));
  const sources = [{ table: "StatusLevel" }] as const;

  const add = Effect.fnUntraced(function* (name: string, kind: StatusKind) {
    const rows = yield* repository.list();
    const now = yield* operationTime;
    const status = yield* checkRules(() => createStatus(newId(now), name, kind, rows));
    yield* undo.capture(undoLabel("Add status", status.name), sources);
    yield* repository.insert(status);
    return status;
  }, undo.record);

  const edit = Effect.fnUntraced(function* (
    id: string,
    action: string,
    change: (row: StatusLevel, rows: readonly StatusLevel[]) => StatusLevel,
  ) {
    const key = yield* decodeId(id);
    const rows = yield* repository.list();
    const row = rows.find((status) => status.id === key);
    if (row === undefined) {
      return yield* Effect.fail(new MetadataRuleError("Status was not found."));
    }
    const status = yield* checkRules(() => change(row, rows));
    yield* undo.capture(undoLabel(action, status.name), sources);
    yield* repository.update(status);
  }, undo.record);

  const reorder = Effect.fnUntraced(function* (ids: readonly string[]) {
    const orderedIds = yield* decodeIds(ids);
    const rows = yield* repository.list();
    const ordered = yield* checkRules(() => reorderStatuses(rows, orderedIds));
    yield* undo.capture("Reorder statuses", sources);
    yield* Effect.forEach(ordered, repository.update, { discard: true });
  }, undo.record);

  return {
    list: () => sql.withTransaction(repository.list()),
    add,
    rename: (id: string, name: string) =>
      edit(id, "Rename status", (row, rows) => renameStatus(row, name, rows)),
    archive: (id: string) =>
      edit(id, "Archive status", (row, rows) => setStatusArchived(row, true, rows)),
    restore: (id: string) =>
      edit(id, "Restore status", (row, rows) => setStatusArchived(row, false, rows)),
    reorder,
  };
});
