import { HISTORY_KEY, HISTORY_REPLAY_KEY } from "./history-queries.js";
import { TaskTrackerClient } from "./task-tracker-client.js";

/** Reactivity key invalidated when the current item choice changes (§7.18). */
export const CURRENT_ITEM_KEY = "current-item";

/**
 * The current item's card, or null when none is chosen or it is deleted. Every
 * recorded write and replay reloads it, so completion, edits, deletes and trash
 * restores show on the star and the tray card.
 */
export const currentItemAtom = TaskTrackerClient.query("LoadCurrentItem", undefined, {
  reactivityKeys: [CURRENT_ITEM_KEY, HISTORY_KEY, HISTORY_REPLAY_KEY],
});

/** Makes an item current, or clears the choice with null. Not an undo step. */
export const setCurrentItemAtom = TaskTrackerClient.mutation("SetCurrentItem");
