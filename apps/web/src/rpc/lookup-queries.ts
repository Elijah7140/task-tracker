import { HISTORY_REPLAY_KEY } from "./history-queries.js";
import { TaskTrackerClient } from "./task-tracker-client.js";

/** Reactivity key shared by every query that displays item types or priority levels. */
export const LOOKUPS_KEY = "lookups";

/** Reactivity key for the item types list. */
export const ITEM_TYPES_KEY = "lookups:item-types";

/** Reactivity key for the priority levels list. */
export const PRIORITY_LEVELS_KEY = "lookups:priority-levels";

/** All item types (active and archived) in server sort order. */
export const itemTypesAtom = TaskTrackerClient.query("ListItemTypes", undefined, {
  reactivityKeys: [HISTORY_REPLAY_KEY, ITEM_TYPES_KEY, LOOKUPS_KEY],
});

/** All priority levels (active and archived) in server sort order. */
export const priorityLevelsAtom = TaskTrackerClient.query("ListPriorityLevels", undefined, {
  reactivityKeys: [HISTORY_REPLAY_KEY, PRIORITY_LEVELS_KEY, LOOKUPS_KEY],
});

/** Adds a custom item type. */
export const addItemTypeAtom = TaskTrackerClient.mutation("AddItemType");

/** Renames an item type. */
export const renameItemTypeAtom = TaskTrackerClient.mutation("RenameItemType");

/** Archives a custom item type. */
export const archiveItemTypeAtom = TaskTrackerClient.mutation("ArchiveItemType");

/** Restores an archived item type. */
export const restoreItemTypeAtom = TaskTrackerClient.mutation("RestoreItemType");

/** Reorders all item types. */
export const reorderItemTypesAtom = TaskTrackerClient.mutation("ReorderItemTypes");

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
