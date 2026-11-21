import type { FolderProjection, ProjectSummary } from "@task-tracker/contracts";
import type { SelectOption } from "../ui/select.js";
import { buildFolderForest, flattenFolderForest } from "../workspace/folder-outline.js";

const STORAGE_KEY = "task-tracker.add-tickets-destination";

/** The value of the folder picker's project-root choice. */
export const TOP_LEVEL = "top-level";

/** Where the multi-ticket add view puts its batch: a project, and a folder or its root. */
export interface BatchDestination {
  readonly projectId: string;
  readonly folderId: string | null;
}

function isDestination(value: unknown): value is BatchDestination {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { projectId, folderId } = value as Record<string, unknown>;
  return typeof projectId === "string" && (folderId === null || typeof folderId === "string");
}

/** The last destination used on this device, or null when none is stored or it is unreadable. */
export function readStoredDestination(): BatchDestination | null {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    const parsed: unknown = stored === null || stored === undefined ? null : JSON.parse(stored);
    return isDestination(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Remembers the destination, a per-device convenience (§7.20). */
export function storeDestination(destination: BatchDestination) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(destination));
  } catch {
    // Storage can be unavailable. The choice then lasts while the window is open.
  }
}

/** The chosen project when it still exists, or else the first project; null without any. */
export function resolveProjectId(
  chosen: BatchDestination | null,
  projects: ReadonlyArray<typeof ProjectSummary.Type>,
): string | null {
  const ids = projects.map(({ project }) => project.id);
  return chosen !== null && ids.includes(chosen.projectId) ? chosen.projectId : (ids[0] ?? null);
}

/** The chosen folder when it is still in the project, or else the project root. */
export function resolveFolderId(
  chosen: BatchDestination | null,
  projectId: string,
  folders: ReadonlyArray<typeof FolderProjection.Type>,
): string | null {
  if (chosen === null || chosen.projectId !== projectId || chosen.folderId === null) {
    return null;
  }
  const folderId = chosen.folderId;
  return folders.some((folder) => folder.id === folderId) ? folderId : null;
}

/** The project picker's choices, in the server's order. */
export function projectOptions(
  projects: ReadonlyArray<typeof ProjectSummary.Type>,
): ReadonlyArray<SelectOption<string>> {
  return projects.map(({ project }) => ({ value: project.id, label: project.name }));
}

/** The folder picker's choices: the project root, then each folder indented by depth. */
export function folderOptions(
  folders: ReadonlyArray<typeof FolderProjection.Type>,
): ReadonlyArray<SelectOption<string>> {
  const nested = flattenFolderForest(buildFolderForest(folders)).map(({ folder, depth }) => ({
    value: folder.id,
    label: `${" ".repeat(depth)}${folder.name}`,
  }));
  return [{ value: TOP_LEVEL, label: "Top level" }, ...nested];
}
