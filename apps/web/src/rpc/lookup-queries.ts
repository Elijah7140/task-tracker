import { HISTORY_REPLAY_KEY } from "./history-queries.js";
import { TaskTrackerClient } from "./task-tracker-client.js";

/** Reactivity key shared by every query that displays priority levels. */
export const LOOKUPS_KEY = "lookups";

/** Reactivity key for the priority levels list. */
export const PRIORITY_LEVELS_KEY = "lookups:priority-levels";

/** All priority levels (active and archived) in server sort order. */
export const priorityLevelsAtom = TaskTrackerClient.query("ListPriorityLevels", undefined, {
  reactivityKeys: [HISTORY_REPLAY_KEY, PRIORITY_LEVELS_KEY, LOOKUPS_KEY],
});

/** Adds a custom priority level. */
export const addPriorityLevelAtom = TaskTrackerClient.mutation("AddPriorityLevel");

/** Renames a priority level. */
export const renamePriorityLevelAtom = TaskTrackerClient.mutation("RenamePriorityLevel");

/** Archives a priority level. */
export const archivePriorityLevelAtom = TaskTrackerClient.mutation("ArchivePriorityLevel");

/** Restores an archived priority level. */
export const restorePriorityLevelAtom = TaskTrackerClient.mutation("RestorePriorityLevel");

/** Reorders all priority levels. */
export const reorderPriorityLevelsAtom = TaskTrackerClient.mutation("ReorderPriorityLevels");

/** Edits a priority's display number independently of its rank. */
export const setPriorityNumberAtom = TaskTrackerClient.mutation("SetPriorityNumber");
