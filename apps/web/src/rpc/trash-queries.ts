import type { Guid } from "@task-tracker/contracts";
import { HISTORY_KEY, HISTORY_REPLAY_KEY } from "./history-queries.js";
import { TaskTrackerClient } from "./task-tracker-client.js";

/** Reactivity key for every Trash listing. */
export const TRASH_KEY = "trash";

/**
 * Keys a restore invalidates. A restore can return rows to any project, folder
 * or area with their counts and completion, the same reach as a replayed step,
 * so it refreshes every data surface through the replay key.
 */
export const RESTORE_REACTIVITY_KEYS = [HISTORY_KEY, HISTORY_REPLAY_KEY, TRASH_KEY] as const;

/** Keys a permanent deletion invalidates. It only removes rows the Trash shows. */
export const PURGE_REACTIVITY_KEYS = [TRASH_KEY] as const;

/** Deletion batches in one project, or in all projects when `projectId` is null, newest first. */
export const trashBatchesAtom = (projectId: typeof Guid.Type | null) =>
  TaskTrackerClient.query(
    "ListTrash",
    { projectId },
    { reactivityKeys: [HISTORY_REPLAY_KEY, TRASH_KEY] },
  );

/** Restores one deletion batch, recording an undo step. */
export const restoreTrashBatchAtom = TaskTrackerClient.mutation("RestoreTrashBatch");

/** Permanently deletes one deletion batch. */
export const purgeTrashBatchAtom = TaskTrackerClient.mutation("PurgeTrashBatch");

/** Permanently deletes every batch in scope. */
export const emptyTrashAtom = TaskTrackerClient.mutation("EmptyTrash");
