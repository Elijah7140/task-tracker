import type { Guid } from "@task-tracker/contracts";
import { TaskTrackerClient } from "./task-tracker-client.js";

type Id = typeof Guid.Type;

/**
 * Reactivity key for one area's item tree. Item mutations and the urgency
 * refresh invalidate it. A null folder is the project root.
 */
export const areaKey = (projectId: Id, folderId: Id | null) =>
  `area:${projectId}:${folderId ?? "root"}`;

/** The item tree, lookups and effective settings of one area, with server-computed urgency. */
export const areaAtom = (projectId: Id, folderId: Id | null) =>
  TaskTrackerClient.query(
    "LoadArea",
    { projectId, folderId },
    { reactivityKeys: [areaKey(projectId, folderId)] },
  );
