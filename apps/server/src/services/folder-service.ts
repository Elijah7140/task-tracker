import { createFolder, FolderTree, renameFolder } from "@task-tracker/core";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql";
import { folderRepository } from "../db/repositories/folder-repository.js";
import { projectItemRepository } from "../db/repositories/project-item-repository.js";
import { projectRepository } from "../db/repositories/project-repository.js";
import { Guid } from "../db/storage-codecs.js";
import { checkRules } from "./check-rules.js";
import { newId } from "./new-id.js";
import { operationTime } from "./operation-time.js";
import { projectCompletionReconciler } from "./project-completion-reconciler.js";
import { UndoService, undoLabel } from "./undo-service.js";

const decodeId = Schema.decodeEffect(Guid);
const decodeParent = Schema.decodeEffect(Schema.NullOr(Guid));
const decodeIds = Schema.decodeEffect(Schema.Array(Guid));

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const undo = yield* UndoService;
  const projects = projectRepository(sql);
  const folders = folderRepository(sql);
  const items = projectItemRepository(sql);
  const reconcile = projectCompletionReconciler(sql);

  const editTree = Effect.fnUntraced(function* <A>(
    projectId: string,
    edit: (tree: FolderTree, now: Temporal.Instant) => { result: A; label: string },
    affectsItems = false,
  ) {
    const project = yield* projects.requireActive(projectId);
    const rows = yield* folders.listAll(project.id);
    const original = new Map(rows.map((row) => [row.id, row]));
    const now = yield* operationTime;
    const tree = yield* checkRules(() => new FolderTree(project.id, rows));
    const { result, label } = yield* checkRules(() => edit(tree, now));
    const where = sql`ProjectId = ${project.id}`;
    yield* undo.capture(label, [
      { table: "Folder", where },
      ...(affectsItems ? [{ table: "TodoItem", where } as const] : []),
    ]);
    for (const row of tree.allRows) {
      const previous = original.get(row.id);
      if (previous === undefined) {
        yield* folders.insert(row);
      } else if (previous !== row) {
        yield* folders.update(row);
      }
    }
    return { result, projectId: project.id, now };
  });

  const create = Effect.fnUntraced(function* (
    projectId: string,
    parentId: string | null,
    name: string,
  ) {
    const parent = yield* decodeParent(parentId);
    const { result } = yield* editTree(projectId, (tree, now) => {
      const folder = createFolder(newId(now), tree.projectId, parent, name, now);
      tree.add(folder, now);
      return { result: tree.get(folder.id), label: undoLabel("Create", folder.name) };
    });
    return result;
  }, undo.record);

  const rename = Effect.fnUntraced(function* (projectId: string, id: string, name: string) {
    const project = yield* projects.requireActive(projectId);
    const rows = yield* folders.listActive(project.id);
    const folderId = yield* decodeId(id);
    const now = yield* operationTime;
    const row = yield* checkRules(() =>
      renameFolder(new FolderTree(project.id, rows).get(folderId), name, now),
    );
    yield* undo.capture(undoLabel("Rename", row.name), [
      { table: "Folder", where: sql`Id = ${row.id}` },
    ]);
    yield* folders.update(row);
  }, undo.record);

  const move = Effect.fnUntraced(function* (
    projectId: string,
    id: string,
    newParentId: string | null,
  ) {
    const folderId = yield* decodeId(id);
    const parent = yield* decodeParent(newParentId);
    yield* editTree(projectId, (tree, now) => ({
      result: tree.move(folderId, parent, now),
      label: undoLabel("Move", tree.get(folderId).name),
    }));
  }, undo.record);

  const reorder = Effect.fnUntraced(function* (
    projectId: string,
    parentId: string | null,
    ids: readonly string[],
  ) {
    const parent = yield* decodeParent(parentId);
    const ordered = yield* decodeIds(ids);
    yield* editTree(projectId, (tree, now) => ({
      result: tree.reorder(parent, ordered, now),
      label: "Reorder folders",
    }));
  }, undo.record);

  const deleteFolder = Effect.fnUntraced(function* (projectId: string, id: string) {
    const folderId = yield* decodeId(id);
    const change = yield* editTree(
      projectId,
      (tree, now) => {
        const batchId = newId(now);
        const name = tree.get(folderId).name;
        tree.deleteSubtree(folderId, batchId, now);
        return { result: batchId, label: undoLabel("Delete", name) };
      },
      true,
    );
    yield* items.deleteForFolderBatch({ ...change, batchId: change.result });
    return change.result;
  }, undo.record);

  const restore = Effect.fnUntraced(function* (projectId: string, batchId: string) {
    const batch = yield* decodeId(batchId);
    const change = yield* editTree(
      projectId,
      (tree, now) => {
        const restored = new Set(tree.restoreBatch(batch, now));
        const root = tree.allRows.find(
          (row) => restored.has(row.id) && !restored.has(row.parentFolderId ?? ""),
        );
        return { result: undefined, label: undoLabel("Restore", root!.name) };
      },
      true,
    );
    yield* items.restoreBatch({ ...change, batchId: batch });
    yield* reconcile(change.projectId, change.now);
  }, undo.record);

  return { create, rename, move, reorder, delete: deleteFolder, restore };
});

/** Transactional folder edits and scoped batch deletion and restore. */
export class FolderService extends Context.Service<FolderService>()(
  "@task-tracker/server/FolderService",
  { make },
) {
  static readonly layer = Layer.effect(this, make);
}
