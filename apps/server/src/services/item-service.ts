import {
  CompletionService,
  createItem,
  editItem,
  FolderTree,
  ItemTree,
  planFieldValueEdits,
  type AppliedCompletion,
  type FieldValueInput,
  type ItemEdit,
  type TodoItem,
} from "@task-tracker/core";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql";
import { fieldRepository } from "../db/repositories/field-repository.js";
import { folderRepository } from "../db/repositories/folder-repository.js";
import { itemFieldValueRepository } from "../db/repositories/item-field-value-repository.js";
import { itemRepository } from "../db/repositories/item-repository.js";
import { lookupRepository } from "../db/repositories/lookup-repository.js";
import { projectItemRepository } from "../db/repositories/project-item-repository.js";
import { projectRepository } from "../db/repositories/project-repository.js";
import { settingsRepository } from "../db/repositories/settings-repository.js";
import { Guid } from "../db/storage-codecs.js";
import { projectAreaItems, type AreaSnapshot } from "./area-snapshot.js";
import { readEffectiveSettings } from "./effective-settings-service.js";
import { checkRules } from "./hierarchy-rules.js";
import { newId } from "./new-id.js";
import { operationTime } from "./operation-time.js";

const decodeId = Schema.decodeEffect(Guid);
const decodeIds = Schema.decodeEffect(Schema.Array(Guid));
const decodeOptionalIds = Schema.decodeEffect(Schema.UndefinedOr(Schema.Array(Guid)));
const decodeNullableId = Schema.decodeEffect(Schema.NullOr(Guid));

const normalizeFieldIds = Effect.fnUntraced(function* (input: FieldValueInput) {
  const fieldDefinitionId = yield* decodeId(input.fieldDefinitionId);
  const choiceId = yield* decodeNullableId(input.choiceId ?? null);
  return { ...input, fieldDefinitionId, choiceId };
});

const make = Effect.fnUntraced(function* (timeZone: string) {
  const sql = yield* SqlClient.SqlClient;
  const projects = projectRepository(sql);
  const folders = folderRepository(sql);
  const items = itemRepository(sql);
  const fields = fieldRepository(sql);
  const itemValues = itemFieldValueRepository(sql);
  const projectItems = projectItemRepository(sql);
  const lookups = lookupRepository(sql);
  const settings = settingsRepository(sql);

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

  const applyCompletion = (projectId: string, now: Temporal.Instant, applied: AppliedCompletion) =>
    Effect.forEach(
      applied.changes,
      (change) => projectItems.setCompletion({ ...change, projectId, now }),
      { discard: true },
    );

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
    const folderTree = yield* loadFolders(projectId);
    const tree = yield* loadTree(folderTree, folderId, includeDeleted);
    const original = new Map(tree.allRows.map((row) => [row.id, row]));
    const now = yield* operationTime;
    const { result, affectedParents } = yield* checkRules(() => change(tree, now));
    const effective = yield* readEffectiveSettings(settings, tree.projectId);
    const applied = yield* checkRules(() =>
      CompletionService.afterStructureChanged(
        tree,
        affectedParents,
        effective.autoCompleteParents.value,
        now,
      ),
    );
    yield* saveStructure(tree, original);
    yield* applyCompletion(tree.projectId, now, applied);
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

  const planCustomEdit = Effect.fnUntraced(function* (
    item: TodoItem,
    customValues: readonly FieldValueInput[],
  ) {
    const inputs = yield* Effect.forEach(customValues, normalizeFieldIds);
    const definitions = yield* fields.definitions.list();
    const choiceIds = new Set(
      inputs.flatMap(({ choiceId }) => (choiceId === null ? [] : [choiceId])),
    );
    const choices = choiceIds.size === 0 ? [] : yield* fields.choices.findByIds([...choiceIds]);
    const existing = yield* itemValues.list(item.id);
    return yield* checkRules(() =>
      planFieldValueEdits(item.id, item.projectId, definitions, choices, existing, inputs),
    );
  });

  const edit = Effect.fnUntraced(function* (
    id: string,
    values: ItemEdit,
    customValues: readonly FieldValueInput[] = [],
  ) {
    const item = yield* items.requireActive(id);
    const now = yield* operationTime;
    const itemTypeId = yield* decodeNullableId(values.itemTypeId);
    const priorityLevelId = yield* decodeNullableId(values.priorityLevelId);
    const edited = yield* checkRules(() =>
      editItem(item, { ...values, itemTypeId, priorityLevelId }, now),
    );
    // The connection lease serializes this snapshot and write with definition mutations.
    const custom =
      customValues.length === 0 ? undefined : yield* planCustomEdit(item, customValues);
    yield* items.updateEdit(edited);
    if (custom) {
      for (const fieldDefinitionId of custom.removals) {
        yield* itemValues.remove({ itemId: item.id, fieldDefinitionId });
      }
      yield* Effect.forEach(custom.upserts, itemValues.upsert, { discard: true });
    }
  }, sql.withTransaction);

  const loadFieldValues = Effect.fnUntraced(function* (id: string) {
    const item = yield* items.requireActive(id);
    return yield* itemValues.list(item.id);
  }, sql.withTransaction);

  const setCompleted = Effect.fnUntraced(function* (
    projectId: string,
    folderId: string | null,
    id: string,
    completed: boolean,
    confirmedOpenItemIds?: readonly string[],
  ) {
    const key = yield* decodeId(id);
    const approval = yield* decodeOptionalIds(confirmedOpenItemIds);
    // Read the tree and settings again even when the caller is confirming a preview.
    const folderTree = yield* loadFolders(projectId);
    const tree = yield* loadTree(folderTree, folderId);
    const effective = yield* readEffectiveSettings(settings, tree.projectId);
    const now = yield* operationTime;
    const autoComplete = effective.autoCompleteParents.value;
    const result = yield* checkRules(() =>
      completed
        ? CompletionService.complete(tree, key, autoComplete, now, approval)
        : CompletionService.reopen(tree, key, autoComplete, now),
    );
    if (result.kind === "applied") {
      yield* applyCompletion(tree.projectId, now, result);
    }
    return result;
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
    // Moving an entire root preserves its parent relationships and completion invariant.
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

  const loadArea = Effect.fnUntraced(function* (projectId: string, folderId: string | null) {
    const folderTree = yield* loadFolders(projectId);
    const tree = yield* loadTree(folderTree, folderId);
    const effective = yield* readEffectiveSettings(settings, tree.projectId);
    const now = yield* operationTime;
    const itemTypes = yield* lookups.itemTypes.list();
    const priorityLevels = yield* lookups.priorityLevels.list();
    return {
      projectId: tree.projectId,
      folderId: tree.folderId,
      items: projectAreaItems(tree, effective, now, timeZone),
      itemTypes,
      priorityLevels,
      settings: effective,
    } satisfies AreaSnapshot;
  }, sql.withTransaction);

  return {
    create,
    edit,
    setCompleted,
    move,
    indent,
    outdent,
    moveToArea,
    reorder,
    delete: deleteItem,
    restore,
    loadArea,
    loadFieldValues,
  };
});

/** Transactional area reads and item edits, including structural and completion writes. */
export class ItemService extends Context.Service<ItemService>()(
  "@task-tracker/server/ItemService",
  {
    make,
  },
) {
  static readonly layer = (timeZone: string) => Layer.effect(this, make(timeZone));
}
