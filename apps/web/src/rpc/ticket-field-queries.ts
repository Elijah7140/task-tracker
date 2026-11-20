import type { Guid } from "@task-tracker/contracts";
import { HISTORY_REPLAY_KEY } from "./history-queries.js";
import { TaskTrackerClient } from "./task-tracker-client.js";

type Id = typeof Guid.Type;

/** Reactivity key for People, Ticket types and the ticket levels (§7.19). */
export const TICKET_LISTS_KEY = "ticket-lists";

/** Reactivity key for one ticket's fields and comments. */
export const ticketKey = (itemId: Id) => `ticket:${itemId}`;

/** Every ticket list entry, archived ones included, in list order. */
export const ticketListsAtom = TaskTrackerClient.query("ListTicketListEntries", undefined, {
  reactivityKeys: [HISTORY_REPLAY_KEY, TICKET_LISTS_KEY],
});

/** One ticket's fixed fields and comment log. */
export const ticketAtom = (itemId: Id) =>
  TaskTrackerClient.query(
    "LoadTicket",
    { itemId },
    { reactivityKeys: [HISTORY_REPLAY_KEY, ticketKey(itemId)] },
  );

/** Adds an entry to a ticket list. */
export const addTicketListEntryAtom = TaskTrackerClient.mutation("AddTicketListEntry");

/** Renames a ticket list entry. */
export const renameTicketListEntryAtom = TaskTrackerClient.mutation("RenameTicketListEntry");

/** Archives a ticket list entry. */
export const archiveTicketListEntryAtom = TaskTrackerClient.mutation("ArchiveTicketListEntry");

/** Restores an archived ticket list entry. */
export const restoreTicketListEntryAtom = TaskTrackerClient.mutation("RestoreTicketListEntry");

/** Reorders one level of a ticket list. */
export const reorderTicketListEntriesAtom = TaskTrackerClient.mutation("ReorderTicketListEntries");
