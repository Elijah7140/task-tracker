import {
  editItem,
  planFieldValueEdits,
  type FieldValueInput,
  type ItemEdit,
  type TodoItem,
} from "@task-tracker/core";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql";
import { fieldRepository } from "../db/repositories/field-repository.js";
import { itemFieldValueRepository } from "../db/repositories/item-field-value-repository.js";
import { itemRepository } from "../db/repositories/item-repository.js";
import { lookupRepository } from "../db/repositories/lookup-repository.js";
import { settingsRepository } from "../db/repositories/settings-repository.js";
import { Guid } from "../db/storage-codecs.js";
import { projectAreaItems, type AreaSnapshot } from "./area-snapshot.js";
import { readEffectiveSettings } from "./effective-settings-service.js";
import { checkRules } from "./check-rules.js";
import { itemCompletionOperations } from "./item-completion-operations.js";
import { itemStructureOperations } from "./item-structure-operations.js";
import { operationTime } from "./operation-time.js";
import { UndoService, undoLabel } from "./undo-service.js";

const decodeId = Schema.decodeEffect(Guid);
const decodeOptionalIds = Schema.decodeEffect(Schema.UndefinedOr(Schema.Array(Guid)));
const decodeNullableId = Schema.decodeEffect(Schema.NullOr(Guid));

const normalizeFieldIds = Effect.fnUntraced(function* (input: FieldValueInput) {
  const fieldDefinitionId = yield* decodeId(input.fieldDefinitionId);
  const choiceId = yield* decodeNullableId(input.choiceId ?? null);
  return { ...input, fieldDefinitionId, choiceId };
});

const make = Effect.fnUntraced(function* (timeZone: string) {
  const sql = yield* SqlClient.SqlClient;
  const undo = yield* UndoService;
  const items = itemRepository(sql);
  const fields = fieldRepository(sql);
  const itemValues = itemFieldValueRepository(sql);
  const lookups = lookupRepository(sql);
  const settings = settingsRepository(sql);

  const completion = itemCompletionOperations(sql);
  const { loadAreaTree, ...structure } = itemStructureOperations(sql, completion, undo);

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
    yield* undo.capture(undoLabel("Edit", edited.title), [
      { table: "TodoItem", where: sql`Id = ${item.id}` },
      { table: "ItemFieldValue", where: sql`ItemId = ${item.id}` },
    ]);
    yield* items.updateEdit(edited);
    if (custom) {
      for (const fieldDefinitionId of custom.removals) {
        yield* itemValues.remove({ itemId: item.id, fieldDefinitionId });
      }
      yield* Effect.forEach(custom.upserts, itemValues.upsert, { discard: true });
    }
  }, undo.record);

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
    const tree = yield* loadAreaTree(projectId, folderId);
    const item = yield* checkRules(() => tree.get(key));
    yield* undo.capture(undoLabel(completed ? "Complete" : "Reopen", item.title), [
      {
        table: "TodoItem",
        where: sql`ProjectId = ${tree.projectId} AND FolderId IS ${tree.folderId}`,
      },
    ]);
    return yield* completion.setCompleted(tree, key, completed, approval);
  }, undo.record);

  const loadArea = Effect.fnUntraced(function* (projectId: string, folderId: string | null) {
    const tree = yield* loadAreaTree(projectId, folderId);
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
    ...structure,
    edit,
    setCompleted,
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
