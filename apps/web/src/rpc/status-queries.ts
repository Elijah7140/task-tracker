import { HISTORY_REPLAY_KEY } from "./history-queries.js";
import { LOOKUPS_KEY } from "./lookup-queries.js";
import { TaskTrackerClient } from "./task-tracker-client.js";

/** Workflow statuses in lookup order, including those still used by existing items. */
export const statusesAtom = TaskTrackerClient.query("ListStatuses", undefined, {
  reactivityKeys: [LOOKUPS_KEY, HISTORY_REPLAY_KEY],
});
