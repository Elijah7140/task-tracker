import {
  buildTicketSections,
  planTicketMove,
  type StatusLevel,
  type TicketMovePlan,
  type TicketPosition,
  type TicketSection,
} from "@task-tracker/core";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql";
import { itemRepository } from "../db/repositories/item-repository.js";
import { lookupRepository } from "../db/repositories/lookup-repository.js";
import { projectRepository } from "../db/repositories/project-repository.js";
import { statusRepository } from "../db/repositories/status-repository.js";
import { type TicketRecord, ticketRepository } from "../db/repositories/ticket-repository.js";
import { Guid } from "../db/storage-codecs.js";
import { checkRules } from "./check-rules.js";
import { operationTime } from "./operation-time.js";
import { ticketUndoSource } from "./ticket-ranks.js";
import { UndoService, undoLabel } from "./undo-service.js";

/** The Tickets sections with the projects the filter offers and the status names rows show. */
export interface LoadedTicketBoard {
  readonly sections: ReadonlyArray<TicketSection<TicketRecord>>;
  readonly projects: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly statuses: ReadonlyArray<StatusLevel>;
}

const decodeId = Schema.decodeEffect(Guid);
const decodeNullableId = Schema.decodeEffect(Schema.NullOr(Guid));

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const undo = yield* UndoService;
  const tickets = ticketRepository(sql);
  const items = itemRepository(sql);
  const lookups = lookupRepository(sql);
  const projects = projectRepository(sql);
  const statuses = statusRepository(sql);

  /** The sections for the filter, with the projects it offers and the status names rows show. */
  const load = Effect.fnUntraced(function* (projectId: string | null) {
    const scope = yield* decodeNullableId(projectId);
    const priorities = yield* lookups.priorityLevels.list();
    const open = yield* tickets.listOpen(scope);
    const board: LoadedTicketBoard = {
      sections: buildTicketSections(open, priorities),
      projects: yield* projects.listActive(),
      statuses: yield* statuses.list(),
    };
    return board;
  }, sql.withTransaction);

  const save = Effect.fnUntraced(function* (itemId: string, plan: TicketMovePlan) {
    if (plan.priorityChanged) {
      const updatedAtUtc = yield* operationTime;
      const priorityLevelId = plan.priorityLevelId;
      yield* items.updatePriority({ id: itemId, updatedAtUtc, priorityLevelId });
    }
    yield* Effect.forEach(plan.ranks, tickets.setRank, { discard: true });
  });

  /** Plans against every open ticket, so a project filter never changes the global order. */
  const change = Effect.fnUntraced(function* (
    id: string,
    position: TicketPosition,
    append: boolean,
  ) {
    const itemId = yield* decodeId(id);
    const open = yield* tickets.listOpen(null);
    const priorities = yield* lookups.priorityLevels.list();
    const plan = yield* checkRules(() =>
      planTicketMove(open, priorities, itemId, position, { append }),
    );
    if (plan === null) {
      return false;
    }
    const title = open.find((ticket) => ticket.id === itemId)?.title ?? "";
    const verb = append ? "Set priority of" : "Move";
    yield* undo.capture(undoLabel(verb, title), [ticketUndoSource(sql)]);
    yield* save(itemId, plan);
    return true;
  }, undo.record);

  /** Moves a ticket before or after an anchor, or to a section's start, in one undo step. */
  const move = Effect.fnUntraced(function* (itemId: string, position: TicketPosition) {
    const priorityLevelId = yield* decodeNullableId(position.priorityLevelId);
    const anchorId = yield* decodeNullableId(position.anchorId);
    return yield* change(itemId, { ...position, priorityLevelId, anchorId }, false);
  });

  /** Changes the priority and appends the ticket after every ticket in its new section. */
  const setPriority = Effect.fnUntraced(function* (itemId: string, priorityId: string | null) {
    const priorityLevelId = yield* decodeNullableId(priorityId);
    return yield* change(itemId, { priorityLevelId, anchorId: null, after: false }, true);
  });

  return { load, move, setPriority };
});

/** Reads and changes the hand-maintained order of open tickets (§7.16). */
export class TicketService extends Context.Service<TicketService>()(
  "@task-tracker/server/TicketService",
  { make },
) {
  static readonly layer = Layer.effect(this, make);
}
