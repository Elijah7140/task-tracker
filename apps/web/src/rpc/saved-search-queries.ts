import { HISTORY_KEY, HISTORY_REPLAY_KEY } from "./history-queries.js";
import { TaskTrackerClient } from "./task-tracker-client.js";

/** Reactivity key for every saved-search list. */
export const SAVED_SEARCHES_KEY = "saved-searches";

/** Keys a saved-search save, rename or delete invalidates. Each records an undo step. */
export const SAVED_SEARCH_REACTIVITY_KEYS = [SAVED_SEARCHES_KEY, HISTORY_KEY] as const;

/** Saved searches in stored order, for Home and the Search page (§7.7). Undo refreshes them. */
export const savedSearchesAtom = TaskTrackerClient.query("ListSavedSearches", undefined, {
  reactivityKeys: [HISTORY_REPLAY_KEY, SAVED_SEARCHES_KEY],
});

/** Reads one saved search as it is now, before Search opens it. */
export const findSavedSearchAtom = TaskTrackerClient.mutation("FindSavedSearch");

/** Saves a new search, or replaces the one with the same name when overwriting. */
export const saveSavedSearchAtom = TaskTrackerClient.mutation("SaveSavedSearch");

/** Renames a saved search. */
export const renameSavedSearchAtom = TaskTrackerClient.mutation("RenameSavedSearch");

/** Deletes a saved search. */
export const deleteSavedSearchAtom = TaskTrackerClient.mutation("DeleteSavedSearch");
