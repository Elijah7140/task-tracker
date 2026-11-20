import { HISTORY_KEY, HISTORY_REPLAY_KEY } from "./history-queries.js";
import { LOOKUPS_KEY } from "./lookup-queries.js";
import { TaskTrackerClient } from "./task-tracker-client.js";

/** Reactivity key for the Today view's query. */
export const TODAY_KEY = "today";

/**
 * Today's completions and their context across all projects (§7.14). Any
 * recorded write, replayed step or lookup change refreshes it, so it updates
 * after every save. The server picks the day from its Effect Clock and zone.
 */
export const todaySnapshotAtom = TaskTrackerClient.query("LoadToday", undefined, {
  reactivityKeys: [TODAY_KEY, HISTORY_KEY, HISTORY_REPLAY_KEY, LOOKUPS_KEY],
});
