import { TicketRpcs } from "@task-tracker/contracts";
import { priorityLabel, type TicketSection } from "@task-tracker/core";
import { Effect, Layer } from "effect";
import type { TicketRecord } from "../db/repositories/ticket-repository.js";
import { type LoadedTicketBoard, TicketService } from "../services/ticket-service.js";
import { mapOperationError } from "./map-operation-error.js";

function projectRow(
  ticket: TicketRecord,
  projectNames: ReadonlyMap<string, string>,
  statusNames: ReadonlyMap<string, string>,
) {
  return {
    itemId: ticket.id,
    projectId: ticket.projectId,
    folderId: ticket.folderId,
    projectName: projectNames.get(ticket.projectId) ?? "",
    ticketNumber: ticket.ticketNumber,
    title: ticket.title,
    statusId: ticket.statusId,
    statusName: ticket.statusId === null ? null : (statusNames.get(ticket.statusId) ?? null),
    priorityLevelId: ticket.priorityLevelId,
    dueDate: ticket.dueDate?.toString() ?? null,
    dueTime: ticket.dueTime?.toString() ?? null,
    hasSchedule: ticket.scheduledStart !== null,
  };
}

/** Sends section labels and the names rows show, so the renderer joins nothing. */
function projectBoard({ sections, projects, statuses }: LoadedTicketBoard) {
  const projectNames = new Map(projects.map(({ id, name }) => [id, name]));
  const statusNames = new Map(statuses.map(({ id, name }) => [id, name]));
  const projectSection = ({ priority, tickets }: TicketSection<TicketRecord>) => ({
    priorityLevelId: priority?.id ?? null,
    label: priority === null ? "No priority" : priorityLabel(priority),
    isArchived: priority?.isArchived ?? false,
    tickets: tickets.map((ticket) => projectRow(ticket, projectNames, statusNames)),
  });
  return {
    sections: sections.map(projectSection),
    projects: projects.map(({ id, name }) => ({ id, name })),
  };
}

/** Bind the Tickets RPCs to the transactional Tickets service. */
export const ticketRpcHandlers = TicketRpcs.toLayer(
  Effect.gen(function* () {
    const tickets = yield* TicketService;
    return {
      LoadTickets: ({ projectId }) =>
        tickets.load(projectId).pipe(Effect.map(projectBoard), mapOperationError),
      MoveTicket: ({ itemId, position }) => tickets.move(itemId, position).pipe(mapOperationError),
      SetTicketPriority: ({ itemId, priorityLevelId }) =>
        tickets.setPriority(itemId, priorityLevelId).pipe(mapOperationError),
    };
  }),
).pipe(Layer.provide(TicketService.layer));
