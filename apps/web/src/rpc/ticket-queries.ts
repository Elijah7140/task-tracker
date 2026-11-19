import type { Guid } from "@task-tracker/contracts";
import { HISTORY_KEY, HISTORY_REPLAY_KEY } from "./history-queries.js";
import { LOOKUPS_KEY } from "./lookup-queries.js";
import { PROJECTS_KEY } from "./project-queries.js";
import { TaskTrackerClient } from "./task-tracker-client.js";

/** Reactivity key for every Tickets board. */
export const TICKETS_KEY = "tickets";

/**
 * The Tickets board for one project, or every project when `projectId` is null.
 * Any recorded write or replayed step refreshes it, so it shows status, due
 * date and priority changes from its row menus and undo (§7.16).
 */
export const ticketBoardAtom = (projectId: typeof Guid.Type | null) =>
  TaskTrackerClient.query(
    "LoadTickets",
    { projectId },
    { reactivityKeys: [TICKETS_KEY, HISTORY_KEY, HISTORY_REPLAY_KEY, LOOKUPS_KEY, PROJECTS_KEY] },
  );

/** Moves a ticket before or after an anchor, or to a section's start. */
export const moveTicketAtom = TaskTrackerClient.mutation("MoveTicket");

/** Sets a ticket's priority and appends it to the new section. */
export const setTicketPriorityAtom = TaskTrackerClient.mutation("SetTicketPriority");
