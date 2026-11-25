import {
  editItem,
  emptyTicketDetail,
  MetadataRuleError,
  parseOrDefault,
  planItemLinkEdits,
  planStatusChange,
  sameRecurrence,
  SettingsCatalogue,
  showsDetailOnCard,
  validateTicketDetail,
  type AppliedCompletion,
  type FieldValueInput,
  type ItemEdit,
  type ItemLinkInput,
  type ItemTree,
  type TicketDetailInput,
  type TodoItem,
} from "@task-tracker/core";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql";
import { itemFieldValueRepository } from "../db/repositories/item-field-value-repository.js";
import { itemLinkRepository } from "../db/repositories/item-link-repository.js";
import { itemRepository } from "../db/repositories/item-repository.js";
import { lookupRepository } from "../db/repositories/lookup-repository.js";
import { statusRepository } from "../db/repositories/status-repository.js";
import { settingsRepository } from "../db/repositories/settings-repository.js";
import { ticketDetailRepository } from "../db/repositories/ticket-detail-repository.js";
import { ticketListRepository } from "../db/repositories/ticket-list-repository.js";
import { Guid } from "../db/storage-codecs.js";
import { projectAreaItems, type AreaSnapshot } from "./area-snapshot.js";
import { addsTicketOccurrence, areaUndoSources } from "./area-undo-sources.js";
import { readEffectiveSettings } from "./effective-settings-service.js";
import { checkRules } from "./check-rules.js";
import { itemAddOperation } from "./item-add-operation.js";
import { itemCompletionOperations } from "./item-completion-operations.js";
import { activePriorityCheck, itemCustomValues } from "./item-custom-values.js";
import { itemPushBackOperation } from "./item-push-back-operation.js";
import { itemRecurrenceOperations } from "./item-recurrence-operations.js";
import { itemStructureOperations } from "./item-structure-operations.js";
import { newId } from "./new-id.js";
import { operationTime } from "./operation-time.js";
import { saveItemRows } from "./save-item-rows.js";
import { appendNewTickets, ticketUndoSource } from "./ticket-ranks.js";
import { ticketBatchOperation } from "./ticket-batch-operation.js";
import { UndoService, undoLabel } from "./undo-service.js";

const decodeId = Schema.decodeEffect(Guid);
const decodeOptionalIds = Schema.decodeEffect(Schema.UndefinedOr(Schema.Array(Guid)));
const decodeNullableId = Schema.decodeEffect(Schema.NullOr(Guid));

const make = Effect.fnUntraced(function* (timeZone: string) {
  const sql = yield* SqlClient.SqlClient;
  const undo = yield* UndoService;
  const items = itemRepository(sql);
  const itemValues = itemFieldValueRepository(sql);
  const itemLinks = itemLinkRepository(sql);
  const lookups = lookupRepository(sql);
  const ticketLists = ticketListRepository(sql);
  const ticketDetails = ticketDetailRepository(sql);
  const customValueWriter = itemCustomValues(sql);
  const requireActivePriority = activePriorityCheck(sql);
  const statuses = statusRepository(sql);
  const settings = settingsRepository(sql);

  const completion = itemCompletionOperations(sql, timeZone);
  const recurrence = itemRecurrenceOperations(sql, undo, timeZone);
  const pushBack = itemPushBackOperation(sql, undo);
  const { loadAreaTree, saveStructure, ...structure } = itemStructureOperations(
    sql,
    completion,
    undo,
  );

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
      const ranksTickets = addsTicketOccurrence(plan.tree, result);
      const sources = areaUndoSources(sql, item.projectId, item.folderId, ranksTickets);
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

  /**
   * The rows an editor save can change. A status change can cascade through the
   * area, and newly numbering an item ranks it and any legacy tickets (§7.16).
   */
  const editUndoSources = (
    item: TodoItem,
    numbered: boolean,
    statusChange: { readonly tree: ItemTree; readonly result: AppliedCompletion } | null,
  ) => {
    if (statusChange !== null) {
      const ranksTickets = numbered || addsTicketOccurrence(statusChange.tree, statusChange.result);
      return areaUndoSources(sql, item.projectId, item.folderId, ranksTickets);
    }
    const own = [
      { table: "TodoItem", where: sql`Id = ${item.id}` },
      { table: "ItemFieldValue", where: sql`ItemId = ${item.id}` },
      { table: "ItemLink", where: sql`ItemId = ${item.id}` },
      { table: "TicketDetail", where: sql`ItemId = ${item.id}` },
    ] as const;
    return numbered ? [...own, ticketUndoSource(sql)] : own;
  };

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

  /** Validates an editor's ticket fields against the lists and the stored fields (§7.19). */
  const planTicketEdit = Effect.fnUntraced(function* (
    item: TodoItem,
    ticket: TicketDetailInput | undefined,
    customValues: readonly FieldValueInput[],
  ) {
    if (item.kind === "Ticket" && customValues.length > 0) {
      return yield* Effect.fail(new MetadataRuleError("Custom fields apply to ToDos only."));
    }
    if (ticket === undefined) {
      return undefined;
    }
    if (item.kind !== "Ticket") {
      return yield* Effect.fail(new MetadataRuleError("Ticket fields apply to tickets only."));
    }
    const previous = yield* ticketDetails.find(item.id);
    const entries = yield* ticketLists.list();
    return yield* checkRules(() => validateTicketDetail(item.id, ticket, entries, previous));
  });

  /**
   * Saves the editor's built-in fields, optional repeat rule and reminder choice, changed custom values,
   * optional status and, when `links` is present, the item's whole link list as one
   * undo step. A Done status completes after the other writes, so a next occurrence
   * copies the final links and values (§7.15). An item that gains a ticket number
   * while open is ranked at the bottom of its section (§7.16).
   */
  const edit = Effect.fnUntraced(function* (
    id: string,
    values: ItemEdit,
    customValues: readonly FieldValueInput[] = [],
    confirmedOpenItemIds?: readonly string[],
    links?: readonly ItemLinkInput[],
    ticket?: TicketDetailInput,
  ) {
    const item = yield* items.requireActive(id);
    const now = yield* operationTime;
    const priorityLevelId = yield* decodeNullableId(values.priorityLevelId);
    const edited = yield* checkRules(() =>
      editItem(item, { ...values, priorityLevelId }, now, () => newId(now)),
    );
    // The connection lease serializes this snapshot and write with definition mutations.
    const ticketPlan = yield* planTicketEdit(item, ticket, customValues);
    const custom =
      customValues.length === 0 ? undefined : yield* customValueWriter.plan(item, customValues);
    const linkPlan = links === undefined ? undefined : yield* planLinks(item.id, links, now);
    const status = yield* planEditStatus(edited, values.statusId, now, confirmedOpenItemIds);
    const { result } = status;
    if (result.kind !== "applied") {
      return result;
    }
    const numbered = item.ticketNumber === null && edited.ticketNumber !== null;
    const statusChange = status.plan === null ? null : { tree: status.plan.tree, result };
    yield* undo.capture(
      editLabel(item, edited, status.changed),
      editUndoSources(item, numbered, statusChange),
    );
    yield* items.updateEdit(edited);
    yield* items.saveRecurrence(edited);
    yield* items.saveReminder(edited);
    if (custom) {
      yield* customValueWriter.write(item.id, custom);
    }
    if (linkPlan) {
      yield* writeLinks(linkPlan);
    }
    if (ticketPlan) {
      yield* ticketDetails.upsert(ticketPlan);
    }
    if (status.plan !== null) {
      yield* applyStatus(edited, status.statusId, now, { ...status.plan, result });
    }
    if (numbered) {
      yield* appendNewTickets(sql, [item.id]);
    }
    return result;
  }, undo.record);

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
   * Moves an item under `levelParent` (null for the area's top level, or the drilled-in item,
   * §7.19) at `index` among that level's other items and assigns `priorityId` in one undoable
   * transaction (§7.17). Promotes or moves sub-items, reconciles parent completion, and clears
   * `TicketRank` when the priority changes.
   */
  const moveToPriorityGroup = Effect.fnUntraced(function* (
    projectId: string,
    folderId: string | null,
    id: string,
    priorityId: string | null,
    index: number,
    levelParent: string | null = null,
  ) {
    const key = yield* decodeId(id);
    const priorityLevelId = yield* decodeNullableId(priorityId);
    const levelParentId = yield* decodeNullableId(levelParent);
    const tree = yield* loadAreaTree(projectId, folderId);
    const original = new Map(tree.allRows.map((row) => [row.id, row]));
    const now = yield* operationTime;
    const item = yield* checkRules(() => tree.get(key));
    const priorityChanged = item.priorityLevelId !== priorityLevelId;
    if (priorityChanged) {
      yield* requireActivePriority(priorityLevelId);
    }
    yield* checkRules(() => tree.moveAt(key, levelParentId, index, now));
    const applied = yield* completion.planReconciliation(
      tree,
      [item.parentItemId, levelParentId],
      now,
    );
    const label = priorityChanged
      ? undoLabel("Set priority of", item.title)
      : undoLabel("Move", item.title);
    const ranksTickets = addsTicketOccurrence(tree, applied);
    yield* undo.capture(label, areaUndoSources(sql, tree.projectId, tree.folderId, ranksTickets));
    yield* saveStructure(tree, original);
    yield* completion.apply(tree.projectId, now, applied);
    if (priorityChanged) {
      yield* items.updatePriority({ id: key, updatedAtUtc: now, priorityLevelId });
    }
  }, undo.record);

  const addDependencies = { loadAreaTree, saveStructure, completion };
  const add = itemAddOperation(sql, undo, addDependencies);
  const addTickets = ticketBatchOperation(sql, undo, addDependencies);

  const requireTicket = Effect.fnUntraced(function* (id: string) {
    const item = yield* items.requireActive(id);
    if (item.kind !== "Ticket") {
      return yield* Effect.fail(new MetadataRuleError("Only tickets have ticket fields."));
    }
    return item;
  });

  /** A ticket's fixed fields, empty when none were saved. */
  const loadTicket = Effect.fnUntraced(function* (id: string) {
    const item = yield* requireTicket(id);
    return (yield* ticketDetails.find(item.id)) ?? emptyTicketDetail(item.id);
  }, sql.withTransaction);

  /**
   * The active item with this ticket number, for the parent ticket's paperclip (§7.19): a
   * ticket before a ToDo, then the most recently updated. Null when there is none.
   */
  const findTicketByNumber = Effect.fnUntraced(function* (ticketNumber: string) {
    const number = ticketNumber.trim();
    return number.length === 0 ? null : yield* ticketDetails.findByTicketNumber(number);
  }, sql.withTransaction);

  /**
   * Shows or hides a ticket's Detail on its card as one undo step (§7.17). The choice is
   * stored on the ticket, so it no longer follows the global setting.
   */
  const setDetailOnCard = Effect.fnUntraced(function* (id: string, show: boolean) {
    const item = yield* requireTicket(id);
    const stored = (yield* ticketDetails.find(item.id)) ?? emptyTicketDetail(item.id);
    if (stored.showDetailOnCard === show) {
      return;
    }
    const verb = show ? "Show description of" : "Hide description of";
    yield* undo.capture(undoLabel(verb, item.title), [
      { table: "TicketDetail", where: sql`ItemId = ${item.id}` },
    ]);
    yield* ticketDetails.upsert({ ...stored, showDetailOnCard: show });
  }, undo.record);

  /** Whether each card of the area shows its Detail: the ticket's choice, else the setting. */
  const readDetailOnCard = Effect.fnUntraced(function* (
    projectId: string,
    folderId: string | null,
  ) {
    const global = yield* settings.global();
    const setting = SettingsCatalogue.showTicketDetailOnCards;
    const globalDefault = parseOrDefault(setting, global.get(setting.key));
    const overrides = yield* ticketDetails.listCardOverrides({ projectId, folderId });
    const byItem = new Map(overrides.map((row) => [row.itemId, row]));
    return (item: TodoItem) =>
      item.kind === "Ticket" && showsDetailOnCard(byItem.get(item.id) ?? null, globalDefault);
  });

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
    const label = undoLabel(completed ? "Complete" : "Reopen", item.title);
    const plan = yield* completion.planCompleted(tree, key, completed, approval);
    const { result } = plan;
    if (result.kind === "applied") {
      const ranksTickets = addsTicketOccurrence(tree, result);
      yield* undo.capture(label, areaUndoSources(sql, tree.projectId, tree.folderId, ranksTickets));
      yield* completion.saveCompleted(tree, plan.original, plan.now, result);
    }
    return result;
  }, undo.record);

  const loadArea = Effect.fnUntraced(function* (projectId: string, folderId: string | null) {
    const tree = yield* loadAreaTree(projectId, folderId);
    const effective = yield* readEffectiveSettings(settings, tree.projectId);
    const now = yield* operationTime;
    const priorityLevels = yield* lookups.priorityLevels.list();
    const showsDetail = yield* readDetailOnCard(tree.projectId, tree.folderId);
    return {
      projectId: tree.projectId,
      folderId: tree.folderId,
      items: projectAreaItems(tree, effective, now, timeZone, showsDetail),
      priorityLevels,
      statuses: yield* statuses.list(),
      settings: effective,
    } satisfies AreaSnapshot;
  }, sql.withTransaction);

  return {
    ...structure,
    ...recurrence,
    ...pushBack,
    add,
    addTickets,
    loadTicket,
    findTicketByNumber,
    setDetailOnCard,
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
