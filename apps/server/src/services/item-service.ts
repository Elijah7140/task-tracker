import {
  editItem,
  MetadataRuleError,
  planFieldValueEdits,
  planItemLinkEdits,
  planStatusChange,
  sameRecurrence,
  type AppliedCompletion,
  type FieldValueInput,
  type ItemEdit,
  type ItemLinkInput,
  type TodoItem,
} from "@task-tracker/core";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql";
import { fieldRepository } from "../db/repositories/field-repository.js";
import { itemFieldValueRepository } from "../db/repositories/item-field-value-repository.js";
import { itemLinkRepository } from "../db/repositories/item-link-repository.js";
import { itemRepository } from "../db/repositories/item-repository.js";
import { lookupRepository } from "../db/repositories/lookup-repository.js";
import { statusRepository } from "../db/repositories/status-repository.js";
import { settingsRepository } from "../db/repositories/settings-repository.js";
import { Guid } from "../db/storage-codecs.js";
import { projectAreaItems, type AreaSnapshot } from "./area-snapshot.js";
import { areaUndoSources } from "./area-undo-sources.js";
import { readEffectiveSettings } from "./effective-settings-service.js";
import { checkRules } from "./check-rules.js";
import { itemCompletionOperations } from "./item-completion-operations.js";
import { itemRecurrenceOperations } from "./item-recurrence-operations.js";
import { itemStructureOperations } from "./item-structure-operations.js";
import { newId } from "./new-id.js";
import { operationTime } from "./operation-time.js";
import { saveItemRows } from "./save-item-rows.js";
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
  const itemLinks = itemLinkRepository(sql);
  const lookups = lookupRepository(sql);
  const statuses = statusRepository(sql);
  const settings = settingsRepository(sql);

  const completion = itemCompletionOperations(sql, timeZone);
  const recurrence = itemRecurrenceOperations(sql, undo, timeZone);
  const { loadAreaTree, saveStructure, ...structure } = itemStructureOperations(
    sql,
    completion,
    undo,
  );

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

  /**
   * Plans a status selection against the area tree. An editor save passes its
   * edited row so a next occurrence copies the final draft (§7.15).
   */
  const planStatus = Effect.fnUntraced(function* (
    item: TodoItem,
    statusId: string | null,
    now: Temporal.Instant,
    confirmedOpenItemIds?: readonly string[],
  ) {
    const tree = yield* loadAreaTree(item.projectId, item.folderId);
    const original = new Map(tree.allRows.map((row) => [row.id, row]));
    const effective = yield* readEffectiveSettings(settings, item.projectId);
    const available = yield* statuses.list();
    const approval = yield* decodeOptionalIds(confirmedOpenItemIds);
    const result = yield* checkRules(() => {
      tree.replace(item);
      return planStatusChange(
        tree,
        item.id,
        statusId,
        available,
        effective.autoCompleteParents.value,
        now,
        approval,
        completion.occurrenceContext(now),
      );
    });
    return { tree, original, result };
  });

  type StatusPlan = Effect.Success<ReturnType<typeof planStatus>>;

  /** Saves a planned status change. A Done status kept off by a new occurrence is not assigned. */
  const applyStatus = Effect.fnUntraced(function* (
    item: TodoItem,
    statusId: string | null,
    now: Temporal.Instant,
    { tree, original, result }: StatusPlan & { readonly result: AppliedCompletion },
  ) {
    yield* saveItemRows(items, tree, original);
    yield* completion.apply(item.projectId, now, result);
    if (result.parentKeptOpenMessage === undefined) {
      yield* items.setStatus({ id: item.id, statusId, now });
    }
  });

  const setStatus = Effect.fnUntraced(function* (
    id: string,
    selection: string | null,
    confirmedOpenItemIds?: readonly string[],
  ) {
    const item = yield* items.requireActive(id);
    const statusId = yield* decodeNullableId(selection);
    if (item.statusId === statusId) {
      return { kind: "applied", changes: [] } satisfies AppliedCompletion;
    }
    const now = yield* operationTime;
    const plan = yield* planStatus(item, statusId, now, confirmedOpenItemIds);
    const { result } = plan;
    if (result.kind === "applied") {
      const sources = areaUndoSources(sql, item.projectId, item.folderId);
      yield* undo.capture(undoLabel("Set status of", item.title), sources);
      yield* applyStatus(item, statusId, now, { ...plan, result });
    }
    return result;
  }, undo.record);

  /** Plans an editor status selection. An omitted or unchanged status plans no completion. */
  const planEditStatus = Effect.fnUntraced(function* (
    item: TodoItem,
    selection: string | null | undefined,
    now: Temporal.Instant,
    confirmedOpenItemIds?: readonly string[],
  ) {
    const statusId = selection === undefined ? item.statusId : yield* decodeNullableId(selection);
    const changed = statusId !== item.statusId;
    const plan = changed ? yield* planStatus(item, statusId, now, confirmedOpenItemIds) : null;
    const result = plan?.result ?? ({ kind: "applied", changes: [] } satisfies AppliedCompletion);
    return { statusId, changed, plan, result };
  });

  /** A status change names the save; a rule change names it next; otherwise it is an edit. */
  const editLabel = (item: TodoItem, edited: TodoItem, statusChanged: boolean) => {
    if (statusChanged) {
      return undoLabel("Set status of", edited.title);
    }
    if (sameRecurrence(item.recurrence, edited.recurrence)) {
      return undoLabel("Edit", edited.title);
    }
    const verb = edited.recurrence === null ? "Stop repeating" : "Set repeat for";
    return undoLabel(verb, item.title);
  };

  const writeCustomValues = Effect.fnUntraced(function* (
    itemId: string,
    custom: Effect.Success<ReturnType<typeof planCustomEdit>>,
  ) {
    for (const fieldDefinitionId of custom.removals) {
      yield* itemValues.remove({ itemId, fieldDefinitionId });
    }
    yield* Effect.forEach(custom.upserts, itemValues.upsert, { discard: true });
  });

  /** Validates a replacement link list against the stored links (§7.10). */
  const planLinks = Effect.fnUntraced(function* (
    itemId: string,
    links: readonly ItemLinkInput[],
    now: Temporal.Instant,
  ) {
    const inputs = yield* Effect.forEach(links, (link) =>
      Effect.map(decodeNullableId(link.id), (linkId) => ({ ...link, id: linkId })),
    );
    const existing = yield* itemLinks.list(itemId);
    return yield* checkRules(() =>
      planItemLinkEdits(itemId, existing, inputs, now, () => newId(now)),
    );
  });

  const writeLinks = Effect.fnUntraced(function* (
    plan: Effect.Success<ReturnType<typeof planLinks>>,
  ) {
    yield* Effect.forEach(plan.removals, itemLinks.remove, { discard: true });
    yield* Effect.forEach(plan.updates, itemLinks.update, { discard: true });
    yield* Effect.forEach(plan.inserts, itemLinks.insert, { discard: true });
  });

  /**
   * Saves the editor's built-in fields, optional repeat rule, changed custom values,
   * optional status and, when `links` is present, the item's whole link list as one
   * undo step. A Done status completes after the other writes, so a next occurrence
   * copies the final links and values (§7.15).
   */
  const edit = Effect.fnUntraced(function* (
    id: string,
    values: ItemEdit,
    customValues: readonly FieldValueInput[] = [],
    confirmedOpenItemIds?: readonly string[],
    links?: readonly ItemLinkInput[],
  ) {
    const item = yield* items.requireActive(id);
    const now = yield* operationTime;
    const itemTypeId = yield* decodeNullableId(values.itemTypeId);
    const priorityLevelId = yield* decodeNullableId(values.priorityLevelId);
    const edited = yield* checkRules(() =>
      editItem(item, { ...values, itemTypeId, priorityLevelId }, now, () => newId(now)),
    );
    // The connection lease serializes this snapshot and write with definition mutations.
    const custom =
      customValues.length === 0 ? undefined : yield* planCustomEdit(item, customValues);
    const linkPlan = links === undefined ? undefined : yield* planLinks(item.id, links, now);
    const status = yield* planEditStatus(edited, values.statusId, now, confirmedOpenItemIds);
    const { result } = status;
    if (result.kind !== "applied") {
      return result;
    }
    yield* undo.capture(
      editLabel(item, edited, status.changed),
      status.changed
        ? areaUndoSources(sql, item.projectId, item.folderId)
        : [
            { table: "TodoItem", where: sql`Id = ${item.id}` },
            { table: "ItemFieldValue", where: sql`ItemId = ${item.id}` },
            { table: "ItemLink", where: sql`ItemId = ${item.id}` },
          ],
    );
    yield* items.updateEdit(edited);
    yield* items.saveRecurrence(edited);
    if (custom) {
      yield* writeCustomValues(item.id, custom);
    }
    if (linkPlan) {
      yield* writeLinks(linkPlan);
    }
    if (status.plan !== null) {
      yield* applyStatus(edited, status.statusId, now, { ...status.plan, result });
    }
    return result;
  }, undo.record);

  const requireActivePriority = Effect.fnUntraced(function* (priorityLevelId: string | null) {
    if (priorityLevelId === null) {
      return;
    }
    const levels = yield* lookups.priorityLevels.list();
    if (!levels.some((level) => level.id === priorityLevelId && !level.isArchived)) {
      return yield* Effect.fail(new MetadataRuleError("Priority is missing or archived."));
    }
  });

  const setPriority = Effect.fnUntraced(function* (id: string, priorityId: string | null) {
    const item = yield* items.requireActive(id);
    const priorityLevelId = yield* decodeNullableId(priorityId);
    if (item.priorityLevelId === priorityLevelId) {
      return;
    }
    yield* requireActivePriority(priorityLevelId);
    const now = yield* operationTime;
    yield* undo.capture(undoLabel("Set priority of", item.title), [
      { table: "TodoItem", where: sql`Id = ${item.id}` },
    ]);
    yield* items.updatePriority({ id: item.id, updatedAtUtc: now, priorityLevelId });
  }, undo.record);

  /**
   * Moves an item to the area's top level at `index` among the other top-level items and assigns
   * `priorityId` in one undoable transaction (§7.17). Promotes sub-items, reconciles parent
   * completion, and clears `TicketRank` when the priority changes.
   */
  const moveToPriorityGroup = Effect.fnUntraced(function* (
    projectId: string,
    folderId: string | null,
    id: string,
    priorityId: string | null,
    index: number,
  ) {
    const key = yield* decodeId(id);
    const priorityLevelId = yield* decodeNullableId(priorityId);
    const tree = yield* loadAreaTree(projectId, folderId);
    const original = new Map(tree.allRows.map((row) => [row.id, row]));
    const now = yield* operationTime;
    const item = yield* checkRules(() => tree.get(key));
    const priorityChanged = item.priorityLevelId !== priorityLevelId;
    if (priorityChanged) {
      yield* requireActivePriority(priorityLevelId);
    }
    yield* checkRules(() => tree.moveAt(key, null, index, now));
    const applied = yield* completion.planReconciliation(tree, [item.parentItemId, null], now);
    const label = priorityChanged
      ? undoLabel("Set priority of", item.title)
      : undoLabel("Move", item.title);
    yield* undo.capture(label, areaUndoSources(sql, tree.projectId, tree.folderId));
    yield* saveStructure(tree, original);
    yield* completion.apply(tree.projectId, now, applied);
    if (priorityChanged) {
      yield* items.updatePriority({ id: key, updatedAtUtc: now, priorityLevelId });
    }
  }, undo.record);

  const loadFieldValues = Effect.fnUntraced(function* (id: string) {
    const item = yield* items.requireActive(id);
    return yield* itemValues.list(item.id);
  }, sql.withTransaction);

  /** An active item's links in list order. A deleted item's links stay hidden until restored. */
  const loadLinks = Effect.fnUntraced(function* (id: string) {
    const item = yield* items.requireActive(id);
    return yield* itemLinks.list(item.id);
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
    yield* undo.capture(
      undoLabel(completed ? "Complete" : "Reopen", item.title),
      areaUndoSources(sql, tree.projectId, tree.folderId),
    );
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
      statuses: yield* statuses.list(),
      settings: effective,
    } satisfies AreaSnapshot;
  }, sql.withTransaction);

  return {
    ...structure,
    ...recurrence,
    edit,
    setCompleted,
    setPriority,
    moveToPriorityGroup,
    setStatus,
    loadArea,
    loadFieldValues,
    loadLinks,
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
