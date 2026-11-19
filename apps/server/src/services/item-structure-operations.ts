import { createItem, FolderTree, ItemTree, type TodoItem } from "@task-tracker/core";
import { Effect, Schema } from "effect";
import type { SqlClient } from "effect/sql";
import { folderRepository } from "../db/repositories/folder-repository.js";
import { itemRepository } from "../db/repositories/item-repository.js";
import { projectRepository } from "../db/repositories/project-repository.js";
import { Guid } from "../db/storage-codecs.js";
import { checkRules } from "./check-rules.js";
import type { itemCompletionOperations } from "./item-completion-operations.js";
import { newId } from "./new-id.js";
import { operationTime } from "./operation-time.js";

const decodeId = Schema.decodeEffect(Guid);
const decodeIds = Schema.decodeEffect(Schema.Array(Guid));
const decodeNullableId = Schema.decodeEffect(Schema.NullOr(Guid));

/** Load and persist item hierarchies, reconciling completion when parent relationships change. */
export function itemStructureOperations(
  sql: SqlClient.SqlClient,
  completion: Pick<ReturnType<typeof itemCompletionOperations>, "planReconciliation" | "apply">,
) {
  const projects = projectRepository(sql);
  const folders = folderRepository(sql);
  const items = itemRepository(sql);

  const loadFolders = Effect.fnUntraced(function* (projectId: string) {
    const project = yield* projects.requireActive(projectId);
    const rows = yield* folders.listActive(project.id);
    return yield* checkRules(() => new FolderTree(project.id, rows));
  });

  const loadTree = Effect.fnUntraced(function* (
    folderTree: FolderTree,
    folderId: string | null,
    includeDeleted: boolean = false,
  ) {
    const key = yield* decodeNullableId(folderId);
    const { projectId } = folderTree;
    const loadRows = includeDeleted ? items.loadAreaIncludingDeleted : items.loadActiveArea;
    const rows = yield* loadRows({ projectId, folderId: key });
    return yield* checkRules(() => new ItemTree(projectId, key, rows, folderTree));
  });

  const loadAreaTree = Effect.fnUntraced(function* (
    projectId: string,
    folderId: string | null,
    includeDeleted = false,
  ) {
    const folderTree = yield* loadFolders(projectId);
    return yield* loadTree(folderTree, folderId, includeDeleted);
  });

  const saveStructure = Effect.fnUntraced(function* (
    tree: ItemTree,
    original: ReadonlyMap<string, TodoItem>,
  ) {
    for (const row of tree.allRows) {
      const previous = original.get(row.id);
      if (previous === undefined) {
        yield* items.insert(row);
      } else if (previous !== row) {
        yield* items.updateStructure(row);
      }
    }
  });

  const editTree = Effect.fnUntraced(function* <A>(
    projectId: string,
    folderId: string | null,
    change: (
      tree: ItemTree,
      now: Temporal.Instant,
    ) => {
      result: A;
      affectedParents: readonly (string | null)[];
    },
    includeDeleted: boolean = false,
  ) {
    const tree = yield* loadAreaTree(projectId, folderId, includeDeleted);
    const original = new Map(tree.allRows.map((row) => [row.id, row]));
    const now = yield* operationTime;
    const { result, affectedParents } = yield* checkRules(() => change(tree, now));
    const applied = yield* completion.planReconciliation(tree, affectedParents, now);
    yield* saveStructure(tree, original);
    yield* completion.apply(tree.projectId, now, applied);
    return result;
  });

  const create = Effect.fnUntraced(function* (
    projectId: string,
    folderId: string | null,
    parentId: string | null,
    title: string,
  ) {
    const parent = yield* decodeNullableId(parentId);
    return yield* editTree(projectId, folderId, (tree, now) => {
      const row = createItem(newId(now), tree.projectId, tree.folderId, parent, title, now);
      tree.add(row, now);
      return { result: tree.get(row.id), affectedParents: [parent] };
    });
  }, sql.withTransaction);

  const reparent = Effect.fnUntraced(function* (
    projectId: string,
    folderId: string | null,
    id: string,
    change: (tree: ItemTree, id: string, now: Temporal.Instant) => void,
  ) {
    const key = yield* decodeId(id);
    yield* editTree(projectId, folderId, (tree, now) => {
      const oldParent = tree.get(key).parentItemId;
      change(tree, key, now);
      return { result: undefined, affectedParents: [oldParent, tree.get(key).parentItemId] };
    });
  });

  const move = Effect.fnUntraced(function* (
    projectId: string,
    folderId: string | null,
    id: string,
    newParentId: string | null,
  ) {
    const parent = yield* decodeNullableId(newParentId);
    yield* reparent(projectId, folderId, id, (tree, key, now) => tree.move(key, parent, now));
  }, sql.withTransaction);

  const indent = (projectId: string, folderId: string | null, id: string) =>
    sql.withTransaction(
      reparent(projectId, folderId, id, (tree, key, now) => tree.indent(key, now)),
    );

  const outdent = (projectId: string, folderId: string | null, id: string) =>
    sql.withTransaction(
      reparent(projectId, folderId, id, (tree, key, now) => tree.outdent(key, now)),
    );

  const moveToArea = Effect.fnUntraced(function* (
    projectId: string,
    sourceFolderId: string | null,
    targetFolderId: string | null,
    id: string,
  ) {
    const key = yield* decodeId(id);
    const folderTree = yield* loadFolders(projectId);
    const source = yield* loadTree(folderTree, sourceFolderId, true);
    const destination = yield* loadTree(folderTree, targetFolderId, true);
    const original = new Map(
      [...source.allRows, ...destination.allRows].map((row) => [row.id, row]),
    );
    const now = yield* operationTime;
    // Only roots move between areas, so completion needs no reconciliation (§6.1).
    yield* checkRules(() => source.moveTopLevelTo(key, destination, now));
    yield* saveStructure(source, original);
    yield* saveStructure(destination, original);
  }, sql.withTransaction);

  const reorder = Effect.fnUntraced(function* (
    projectId: string,
    folderId: string | null,
    parentId: string | null,
    ids: readonly string[],
  ) {
    const parent = yield* decodeNullableId(parentId);
    const order = yield* decodeIds(ids);
    yield* editTree(projectId, folderId, (tree, now) => {
      tree.reorder(parent, order, now);
      return { result: undefined, affectedParents: [parent] };
    });
  }, sql.withTransaction);

  const deleteItem = Effect.fnUntraced(function* (
    projectId: string,
    folderId: string | null,
    id: string,
  ) {
    const key = yield* decodeId(id);
    return yield* editTree(projectId, folderId, (tree, now) => {
      const parent = tree.get(key).parentItemId;
      const batchId = newId(now);
      tree.deleteSubtree(key, batchId, now);
      return { result: batchId, affectedParents: [parent] };
    });
  }, sql.withTransaction);

  const restore = Effect.fnUntraced(function* (
    projectId: string,
    folderId: string | null,
    batchId: string,
  ) {
    const batch = yield* decodeId(batchId);
    yield* editTree(
      projectId,
      folderId,
      (tree, now) => {
        const restored = tree.restoreBatch(batch, now);
        const affectedParents = restored.map((id) => tree.get(id).parentItemId);
        return { result: undefined, affectedParents };
      },
      true,
    );
  }, sql.withTransaction);

  return {
    create,
    move,
    indent,
    outdent,
    moveToArea,
    reorder,
    delete: deleteItem,
    restore,
    loadAreaTree,
  };
}
