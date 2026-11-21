import {
  HierarchyError,
  MetadataRuleError,
  type ItemEdit,
  type TicketDetailInput,
} from "@task-tracker/core";
import { Effect } from "effect";
import type { SqlClient } from "effect/sql";
import { areaUndoSources } from "./area-undo-sources.js";
import { type ItemAddDependencies, type ItemAddInput, itemAddSteps } from "./item-add-operation.js";
import { operationTime } from "./operation-time.js";
import { type UndoService, undoLabel } from "./undo-service.js";

/** One ticket of a batch from the tray's multi-ticket add view (§7.20). */
export interface NewTicket {
  readonly fields: ItemEdit;
  /** The fixed ticket fields; null saves an empty set. */
  readonly ticket: TicketDetailInput | null;
}

/** Tickets to add, in order, to the top level of one area. */
export interface TicketBatchInput {
  readonly projectId: string;
  readonly folderId: string | null;
  readonly tickets: readonly NewTicket[];
}

/**
 * A rule refused the ticket at `index`, so the batch saved nothing. The RPC layer sends
 * the index so the view can mark the ticket to fix.
 */
export class TicketBatchRejection extends MetadataRuleError {
  constructor(
    readonly index: number,
    message: string,
  ) {
    super(message);
  }
}

/** Names the ticket a rule refused, keeping missing targets and other failures as they are. */
function rejectAt(index: number) {
  return <E>(error: E) =>
    error instanceof MetadataRuleError || error instanceof HierarchyError
      ? new TicketBatchRejection(index, error.message)
      : error;
}

/** "Create ⟨title⟩" for one ticket, as quick add says, or "Create n tickets". */
function batchLabel(titles: readonly string[]) {
  const [first] = titles;
  return titles.length === 1 && first !== undefined
    ? undoLabel("Create", first)
    : `Create ${titles.length} tickets`;
}

function ticketInput(input: TicketBatchInput, ticket: NewTicket): ItemAddInput {
  return {
    projectId: input.projectId,
    folderId: input.folderId,
    parentItemId: null,
    kind: "Ticket",
    fields: ticket.fields,
    customValues: [],
    ticket: ticket.ticket,
  };
}

/**
 * Adds every ticket to the top level of one area in the given order, as one transaction
 * and one undo step (§7.20). Each ticket follows the quick-add rules (§7.19) and joins the
 * bottom of its Tickets section in order (§7.16). When a rule refuses any ticket, nothing
 * is saved and the failure names that ticket's index.
 */
export function ticketBatchOperation(
  sql: SqlClient.SqlClient,
  undo: UndoService["Service"],
  dependencies: ItemAddDependencies,
) {
  const steps = itemAddSteps(sql);
  const { completion } = dependencies;

  return Effect.fnUntraced(function* (input: TicketBatchInput) {
    if (input.tickets.length === 0) {
      return yield* Effect.fail(new MetadataRuleError("Add at least one ticket."));
    }
    const tree = yield* dependencies.loadAreaTree(input.projectId, input.folderId);
    const original = new Map(tree.allRows.map((row) => [row.id, row]));
    const now = yield* operationTime;
    const prepared = yield* Effect.forEach(input.tickets, (ticket, index) =>
      steps.prepare(tree, ticketInput(input, ticket), now).pipe(Effect.mapError(rejectAt(index))),
    );
    const applied = yield* completion.planReconciliation(tree, [null], now);
    const titles = prepared.map(({ row }) => row.title);
    yield* undo.capture(batchLabel(titles), areaUndoSources(sql, tree.projectId, tree.folderId));
    yield* dependencies.saveStructure(tree, original);
    yield* completion.apply(tree.projectId, now, applied);
    yield* Effect.forEach(prepared, steps.writeExtras, { discard: true });
    const rows = prepared.map(({ row }) => row);
    yield* steps.rankTickets(rows);
    return rows;
  }, undo.record);
}
