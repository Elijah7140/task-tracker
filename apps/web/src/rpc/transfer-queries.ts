import { HISTORY_REPLAY_KEY } from "./history-queries.js";
import { PROJECTS_KEY } from "./project-queries.js";
import { SAVED_SEARCHES_KEY } from "./saved-search-queries.js";
import { TaskTrackerClient } from "./task-tracker-client.js";

/**
 * Keys an import invalidates. An import adds projects, saved searches, lookups
 * and fields, so it refreshes every surface that replay refreshes (§7.9).
 */
export const IMPORT_REACTIVITY_KEYS = [HISTORY_REPLAY_KEY, PROJECTS_KEY, SAVED_SEARCHES_KEY];

/** Reads the project list as it is now, for the Export project choice. */
export const listProjectsForExportAtom = TaskTrackerClient.mutation("ListProjects");

/** Writes a JSON export of everything or one project to a chosen file. */
export const exportJsonAtom = TaskTrackerClient.mutation("ExportJson");

/** Reads and checks a chosen import file without writing anything. */
export const previewJsonImportAtom = TaskTrackerClient.mutation("PreviewJsonImport");

/** Imports a checked file as new data after a backup, or reports why it refused. */
export const importJsonAtom = TaskTrackerClient.mutation("ImportJson");
