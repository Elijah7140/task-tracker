import {
  createItem,
  dropItem,
  FolderTree,
  HierarchyError,
  ItemTree,
  type TodoItem,
} from "@task-tracker/core";
import { Effect, Schema } from "effect";
import type { SqlClient } from "effect/sql";
import { folderRepository } from "../db/repositories/folder-repository.js";
import { itemRepository } from "../db/repositories/item-repository.js";
import { projectRepository } from "../db/repositories/project-repository.js";
import { Guid } from "../db/storage-codecs.js";
import { addsTicketOccurrence, areaUndoSources } from "./area-undo-sources.js";
import { checkRules } from "./check-rules.js";
import type { itemCompletionOperations } from "./item-completion-operations.js";
import { newId } from "./new-id.js";
import { operationTime } from "./operation-time.js";
import { saveItemRows } from "./save-item-rows.js";
import { type UndoService, undoLabel } from "./undo-service.js";

const decodeId = Schema.decodeEffect(Guid);
const decodeIds = Schema.decodeEffect(Schema.Array(Guid));
const decodeNullableId = Schema.decodeEffect(Schema.NullOr(Guid));

/**
 * Moves a just-created item right after an open sibling under the same parent, so an
 * outline's inline add inserts in place within the create's one undo step (§7.17).
 */
function placeAfterSibling(tree: ItemTree, itemId: string, afterId: string, now: Temporal.Instant) {
  if (tree.get(afterId).parentItemId !== tree.get(itemId).parentItemId) {
    throw new HierarchyError("The new item must be placed after a sibling.");
  }
  dropItem(tree, itemId, afterId, "after", now);
}

/** Load and persist item hierarchies, reconciling completion when parent relationships change. */
export function itemStructureOperations(
  sql: SqlClient.SqlClient,
  completion: Pick<ReturnType<typeof itemCompletionOperations>, "planReconciliation" | "apply">,
  undo: UndoService["Service"],
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

  const saveStructure = (tree: ItemTree, original: ReadonlyMap<string, TodoItem>) =>
    saveItemRows(items, tree, original);

  const editTree = Effect.fnUntraced(function* <A>(
    projectId: string,
    folderId: string | null,
    change: (
      tree: ItemTree,
      now: Temporal.Instant,
    ) => {
      result: A;
      label: string;
      affectedParents: readonly (string | null)[];
    },
    includeDeleted: boolean = false,
    occurrences: boolean = true,
  ) {
    const tree = yield* loadAreaTree(projectId, folderId, includeDeleted);
    const original = new Map(tree.allRows.map((row) => [row.id, row]));
    const now = yield* operationTime;
    const { result, label, affectedParents } = yield* checkRules(() => change(tree, now));
    const applied = yield* completion.planReconciliation(tree, affectedParents, now, occurrences);
    const ranksTickets = addsTicketOccurrence(tree, applied);
    yield* undo.capture(label, areaUndoSources(sql, tree.projectId, tree.folderId, ranksTickets));
    yield* saveStructure(tree, original);
    yield* completion.apply(tree.projectId, now, applied);
    return result;
  });

  const create = Effect.fnUntraced(function* (
    projectId: string,
    folderId: string | null,
    parentId: string | null,
    title: string,
    afterItemId?: string,
  ) {
    const parent = yield* decodeNullableId(parentId);
    const after = afterItemId === undefined ? undefined : yield* decodeId(afterItemId);
    return yield* editTree(projectId, folderId, (tree, now) => {
      const row = createItem(newId(now), tree.projectId, tree.folderId, parent, title, now);
      tree.add(row, now);
      if (after !== undefined) {
        placeAfterSibling(tree, row.id, after, now);
      }
      return {
        result: tree.get(row.id),
        label: undoLabel("Create", row.title),
        affectedParents: [parent],
      };
    });
  }, undo.record);

  const reparent = Effect.fnUntraced(function* (
    projectId: string,
    folderId: string | null,
    id: string,
    verb: string,
    change: (tree: ItemTree, id: string, now: Temporal.Instant) => void,
  ) {
    const key = yield* decodeId(id);
    yield* editTree(projectId, folderId, (tree, now) => {
      const item = tree.get(key);
      change(tree, key, now);
      return {
        result: undefined,
        label: undoLabel(verb, item.title),
        affectedParents: [item.parentItemId, tree.get(key).parentItemId],
      };
    });
  });

  const move = Effect.fnUntraced(function* (
    projectId: string,
    folderId: string | null,
    id: string,
    newParentId: string | null,
  ) {
    const parent = yield* decodeNullableId(newParentId);
    yield* reparent(projectId, folderId, id, "Move", (tree, key, now) =>
      tree.move(key, parent, now),
    );
  }, undo.record);

  const drop = Effect.fnUntraced(function* (
    projectId: string,
    folderId: string | null,
    id: string,
    targetItemId: string,
    position: Parameters<typeof dropItem>[3],
  ) {
    const target = yield* decodeId(targetItemId);
    yield* reparent(projectId, folderId, id, "Move", (tree, key, now) =>
      dropItem(tree, key, target, position, now),
    );
  }, undo.record);

  const indent = (projectId: string, folderId: string | null, id: string) =>
    undo.record(
      reparent(projectId, folderId, id, "Indent", (tree, key, now) => tree.indent(key, now)),
    );

  const outdent = (projectId: string, folderId: string | null, id: string) =>
    undo.record(
      reparent(projectId, folderId, id, "Outdent", (tree, key, now) => tree.outdent(key, now)),
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
    const item = yield* checkRules(() => source.get(key));
    // Only roots move between areas, so completion needs no reconciliation (§6.1).
    yield* checkRules(() => source.moveTopLevelTo(key, destination, now));
    yield* undo.capture(undoLabel("Move", item.title), [
      {
        table: "TodoItem",
        where: sql`ProjectId = ${source.projectId}
        AND (FolderId IS ${source.folderId} OR FolderId IS ${destination.folderId})`,
      },
    ]);
    yield* saveStructure(source, original);
    yield* saveStructure(destination, original);
  }, undo.record);

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
      return { result: undefined, label: "Reorder items", affectedParents: [parent] };
    });
  }, undo.record);

  const deleteItem = Effect.fnUntraced(function* (
    projectId: string,
    folderId: string | null,
    id: string,
  ) {
    const key = yield* decodeId(id);
    return yield* editTree(projectId, folderId, (tree, now) => {
      const item = tree.get(key);
      const batchId = newId(now);
      tree.deleteSubtree(key, batchId, now);
      return {
        result: batchId,
        label: undoLabel("Delete", item.title),
        affectedParents: [item.parentItemId],
      };
    });
  }, undo.record);

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
        const restoredIds = new Set(restored);
        const root = restored
          .map((id) => tree.get(id))
          .find((row) => !restoredIds.has(row.parentItemId ?? ""));
        return { result: undefined, label: undoLabel("Restore", root!.title), affectedParents };
      },
      true,
      // Restore keeps the completion invariant without generating occurrences (§7.11).
      false,
    );
  }, undo.record);

  return {
    create,
    move,
    drop,
    indent,
    outdent,
    moveToArea,
    reorder,
    delete: deleteItem,
    restore,
    loadAreaTree,
    saveStructure,
  };
}
