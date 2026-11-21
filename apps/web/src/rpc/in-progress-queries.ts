import { HISTORY_KEY, HISTORY_REPLAY_KEY } from "./history-queries.js";
import { LOOKUPS_KEY } from "./lookup-queries.js";
import { TaskTrackerClient } from "./task-tracker-client.js";

/** Reactivity key that reloads the tray card's in-progress stack (§7.18). */
export const IN_PROGRESS_KEY = "in-progress";

/**
 * The tray card's stack: open items whose status is marked In progress, in the
 * server's order. Every recorded write, replay and status change reloads it,
 * so completion, edits, deletes and new marks show on the card.
 */
export const inProgressItemsAtom = TaskTrackerClient.query("LoadInProgressItems", undefined, {
  reactivityKeys: [IN_PROGRESS_KEY, HISTORY_KEY, HISTORY_REPLAY_KEY, LOOKUPS_KEY],
});
