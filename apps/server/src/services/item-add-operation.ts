import {
  createItem,
  editItem,
  emptyTicketDetail,
  MetadataRuleError,
  validateTicketDetail,
  type FieldValueInput,
  type ItemEdit,
  type ItemKind,
  type ItemTree,
  type StatusLevel,
  type TicketDetail,
  type TicketDetailInput,
  type TodoItem,
} from "@task-tracker/core";
import { Effect, Schema } from "effect";
import type { SqlClient } from "effect/sql";
import { statusRepository } from "../db/repositories/status-repository.js";
import { ticketDetailRepository } from "../db/repositories/ticket-detail-repository.js";
import { ticketListRepository } from "../db/repositories/ticket-list-repository.js";
import { Guid } from "../db/storage-codecs.js";
import { addsTicketOccurrence, areaUndoSources } from "./area-undo-sources.js";
import { checkRules } from "./check-rules.js";
import type { itemCompletionOperations } from "./item-completion-operations.js";
import { activePriorityCheck, itemCustomValues } from "./item-custom-values.js";
import type { itemStructureOperations } from "./item-structure-operations.js";
import { newId } from "./new-id.js";
import { operationTime } from "./operation-time.js";
import { appendNewTickets } from "./ticket-ranks.js";
import { type UndoService, undoLabel } from "./undo-service.js";

const decodeNullableId = Schema.decodeEffect(Schema.NullOr(Guid));

/** What quick add and the detailed add view save (§7.19). */
export interface ItemAddInput {
  readonly projectId: string;
  readonly folderId: string | null;
  readonly parentItemId: string | null;
  readonly kind: ItemKind;
  /** The item's fields, including an optional open status and reminder choice. */
  readonly fields: ItemEdit;
  /** Custom field values. Only ToDos carry them. */
  readonly customValues: readonly FieldValueInput[];
  /** The fixed ticket fields. Only tickets carry them; null saves an empty set. */
  readonly ticket: TicketDetailInput | null;
}

/** The structure and completion helpers an add shares with other item writes. */
export interface ItemAddDependencies {
  readonly loadAreaTree: ReturnType<typeof itemStructureOperations>["loadAreaTree"];
  readonly saveStructure: ReturnType<typeof itemStructureOperations>["saveStructure"];
  readonly completion: Pick<
    ReturnType<typeof itemCompletionOperations>,
    "planReconciliation" | "apply"
  >;
}

function checkKindFields(input: ItemAddInput) {
  if (input.kind === "Ticket" && input.customValues.length > 0) {
    throw new MetadataRuleError("Custom fields apply to ToDos only.");
  }
  if (input.kind === "Todo" && input.ticket !== null) {
    throw new MetadataRuleError("Ticket fields apply to tickets only.");
  }
}

/** A new item may start with an open status, never a Done one, which would need completion. */
function openStatusId(statusId: string | null | undefined, statuses: readonly StatusLevel[]) {
  if (statusId === undefined || statusId === null) {
    return null;
  }
  const status = statuses.find((candidate) => candidate.id === statusId);
  if (status === undefined || status.isArchived) {
    throw new MetadataRuleError("Status is missing or archived.");
  }
  if (status.kind !== "Open") {
    throw new MetadataRuleError("Choose an open status when adding an item.");
  }
  return status.id;
}

/** Builds the new row with every field filled in, then places it in the tree. */
function addRow(
  tree: ItemTree,
  input: ItemAddInput,
  parentId: string | null,
  statusId: string | null,
  now: Temporal.Instant,
) {
  const created = createItem(
    newId(now),
    tree.projectId,
    tree.folderId,
    parentId,
    input.fields.title,
    now,
    input.kind,
  );
  const row = { ...editItem(created, input.fields, now), statusId };
  tree.add(row, now);
  return tree.get(row.id);
}

/**
 * The steps every add shares (§7.19): `prepare` validates one input and places its row in
 * a loaded area tree. After the tree is saved, `writeExtras` saves its ticket details and
 * custom values, and `rankTickets` ranks the new tickets together, in order, so none is
 * ranked as a legacy row first. Callers own the transaction and the undo step.
 */
export function itemAddSteps(sql: SqlClient.SqlClient) {
  const statuses = statusRepository(sql);
  const lists = ticketListRepository(sql);
  const details = ticketDetailRepository(sql);
  const customValues = itemCustomValues(sql);
  const requireActivePriority = activePriorityCheck(sql);
  type CustomPlan = Effect.Success<ReturnType<typeof customValues.plan>>;

  const planTicket = Effect.fnUntraced(function* (row: TodoItem, input: ItemAddInput) {
    if (row.kind !== "Ticket") {
      return null;
    }
    const { itemId: _itemId, ...empty } = emptyTicketDetail(row.id);
    const entries = yield* lists.list();
    return yield* checkRules(() =>
      validateTicketDetail(row.id, input.ticket ?? empty, entries, null),
    );
  });

  const prepare = Effect.fnUntraced(function* (
    tree: ItemTree,
    input: ItemAddInput,
    now: Temporal.Instant,
  ) {
    yield* checkRules(() => checkKindFields(input));
    const parentId = yield* decodeNullableId(input.parentItemId);
    const priorityLevelId = yield* decodeNullableId(input.fields.priorityLevelId);
    const statusId = yield* decodeNullableId(input.fields.statusId ?? null);
    yield* requireActivePriority(priorityLevelId);
    const available = yield* statuses.list();
    const fields = { ...input.fields, priorityLevelId, statusId };
    const row = yield* checkRules(() =>
      addRow(tree, { ...input, fields }, parentId, openStatusId(statusId, available), now),
    );
    const ticket = yield* planTicket(row, input);
    const custom =
      input.customValues.length === 0
        ? undefined
        : yield* customValues.plan(row, input.customValues);
    return { row, parentId, ticket, custom };
  });

  const writeExtras = Effect.fnUntraced(function* (prepared: {
    readonly row: TodoItem;
    readonly ticket: TicketDetail | null;
    readonly custom: CustomPlan | undefined;
  }) {
    const { row, ticket, custom } = prepared;
    if (ticket !== null) {
      yield* details.upsert(ticket);
    }
    if (custom !== undefined) {
      yield* customValues.write(row.id, custom);
    }
  });

  /** Ranks the new open tickets at the bottom of their Tickets sections in one pass (§7.16). */
  const rankTickets = (rows: readonly TodoItem[]) =>
    appendNewTickets(
      sql,
      rows.map((row) => row.id),
    );

  return { prepare, writeExtras, rankTickets };
}

/**
 * Adds a ToDo or Ticket with its fields, ticket details and custom values as one undo step,
 * "Create ⟨title⟩" (§7.19). Adding an open child reopens completed ancestors (§6.1), and a
 * numbered item joins the bottom of its Tickets section (§7.16).
 */
export function itemAddOperation(
  sql: SqlClient.SqlClient,
  undo: UndoService["Service"],
  dependencies: ItemAddDependencies,
) {
  const steps = itemAddSteps(sql);
  const { completion } = dependencies;

  return Effect.fnUntraced(function* (input: ItemAddInput) {
    const tree = yield* dependencies.loadAreaTree(input.projectId, input.folderId);
    const original = new Map(tree.allRows.map((row) => [row.id, row]));
    const now = yield* operationTime;
    const prepared = yield* steps.prepare(tree, input, now);
    const applied = yield* completion.planReconciliation(tree, [prepared.parentId], now);
    const ranksTickets = prepared.row.ticketNumber !== null || addsTicketOccurrence(tree, applied);
    yield* undo.capture(
      undoLabel("Create", prepared.row.title),
      areaUndoSources(sql, tree.projectId, tree.folderId, ranksTickets),
    );
    yield* dependencies.saveStructure(tree, original);
    yield* completion.apply(tree.projectId, now, applied);
    yield* steps.writeExtras(prepared);
    yield* steps.rankTickets([prepared.row]);
    return prepared.row;
  }, undo.record);
}
