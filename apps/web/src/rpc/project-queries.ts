import type { Guid } from "@task-tracker/contracts";
import { HISTORY_REPLAY_KEY } from "./history-queries.js";
import { TaskTrackerClient } from "./task-tracker-client.js";

/** Reactivity key shared by every query that shows project names or counts. */
export const PROJECTS_KEY = "projects";

/** Reactivity key for one project's navigation snapshot, refreshed after folder mutations. */
export const projectKey = (projectId: typeof Guid.Type) => `project:${projectId}`;

/** Home summaries with open and overdue counts, refreshed after project mutations. */
export const projectSummariesAtom = TaskTrackerClient.query("ListProjects", undefined, {
  reactivityKeys: [HISTORY_REPLAY_KEY, PROJECTS_KEY],
});

/** The navigation snapshot of one project, refreshed after project mutations. */
export const projectWorkspaceAtom = (projectId: typeof Guid.Type) =>
  TaskTrackerClient.query(
    "LoadWorkspace",
    { projectId },
    { reactivityKeys: [HISTORY_REPLAY_KEY, PROJECTS_KEY, projectKey(projectId)] },
  );

/** Creates a project. */
export const createProjectAtom = TaskTrackerClient.mutation("CreateProject");

/** Renames a project. */
export const renameProjectAtom = TaskTrackerClient.mutation("RenameProject");

/** Soft-deletes a project and its contents. */
export const deleteProjectAtom = TaskTrackerClient.mutation("DeleteProject");

/** Sets or clears a project's icon (§7.19). */
export const setProjectIconAtom = TaskTrackerClient.mutation("SetProjectIcon");
