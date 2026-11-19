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

const decodeId = Schema.decodeEffect(Guid);
const decodeParent = Schema.decodeEffect(Schema.NullOr(Guid));
const decodeIds = Schema.decodeEffect(Schema.Array(Guid));

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const projects = projectRepository(sql);
  const folders = folderRepository(sql);
  const items = projectItemRepository(sql);
  const reconcile = projectCompletionReconciler(sql);

  const editTree = Effect.fnUntraced(function* <A>(
    projectId: string,
    edit: (tree: FolderTree, now: Temporal.Instant) => A,
  ) {
    const project = yield* projects.requireActive(projectId);
    const rows = yield* folders.listAll(project.id);
    const original = new Map(rows.map((row) => [row.id, row]));
    const now = yield* operationTime;
    const tree = yield* checkRules(() => new FolderTree(project.id, rows));
    const result = yield* checkRules(() => edit(tree, now));
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
      return tree.get(folder.id);
    });
    return result;
  }, sql.withTransaction);

  const rename = Effect.fnUntraced(function* (projectId: string, id: string, name: string) {
    const project = yield* projects.requireActive(projectId);
    const rows = yield* folders.listActive(project.id);
    const folderId = yield* decodeId(id);
    const now = yield* operationTime;
    const row = yield* checkRules(() =>
      renameFolder(new FolderTree(project.id, rows).get(folderId), name, now),
    );
    yield* folders.update(row);
  }, sql.withTransaction);

  const move = Effect.fnUntraced(function* (
    projectId: string,
    id: string,
    newParentId: string | null,
  ) {
    const folderId = yield* decodeId(id);
    const parent = yield* decodeParent(newParentId);
    yield* editTree(projectId, (tree, now) => tree.move(folderId, parent, now));
  }, sql.withTransaction);

  const reorder = Effect.fnUntraced(function* (
    projectId: string,
    parentId: string | null,
    ids: readonly string[],
  ) {
    const parent = yield* decodeParent(parentId);
    const ordered = yield* decodeIds(ids);
    yield* editTree(projectId, (tree, now) => tree.reorder(parent, ordered, now));
  }, sql.withTransaction);

  const deleteFolder = Effect.fnUntraced(function* (projectId: string, id: string) {
    const folderId = yield* decodeId(id);
    const change = yield* editTree(projectId, (tree, now) => {
      const batchId = newId(now);
      tree.deleteSubtree(folderId, batchId, now);
      return batchId;
    });
    yield* items.deleteForFolderBatch({ ...change, batchId: change.result });
    return change.result;
  }, sql.withTransaction);

  const restore = Effect.fnUntraced(function* (projectId: string, batchId: string) {
    const batch = yield* decodeId(batchId);
    const change = yield* editTree(projectId, (tree, now) => tree.restoreBatch(batch, now));
    yield* items.restoreBatch({ ...change, batchId: batch });
    yield* reconcile(change.projectId, change.now);
  }, sql.withTransaction);

  return { create, rename, move, reorder, delete: deleteFolder, restore };
});

/** Transactional folder edits and scoped batch deletion and restore. */
export class FolderService extends Context.Service<FolderService>()(
  "@task-tracker/server/FolderService",
  { make },
) {
  static readonly layer = Layer.effect(this, make);
}
